// Every sound in the game, synthesised at runtime. No files, nothing fetched.
//
// Browsers block audio until a gesture, so nothing is built until unlock() is
// called, and every entry point is a no-op when there is no AudioContext at
// all (older browsers, headless runs, autoplay refusals) rather than throwing
// into the frame loop.

const MAX_VOICES = 28;

export function createAudio() {
  const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);

  let ctx = null;
  let master = null, sfxBus = null, musicBus = null, comp = null;
  let noiseBuffer = null;
  let voices = 0;
  let unlocked = false;
  let tension = 0;
  let currentTrack = null;
  let musicNodes = [];
  const levels = { master: 0.8, sfx: 0.9, music: 0.5 };
  const listener = { pos: { x: 0, y: 0, z: 0 }, yaw: 0 };

  function unlock() {
    if (unlocked || !Ctx) return;
    try {
      ctx = new Ctx();
      master = ctx.createGain();
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 24;
      comp.ratio.value = 8;
      comp.attack.value = 0.004;
      comp.release.value = 0.22;
      sfxBus = ctx.createGain();
      musicBus = ctx.createGain();
      sfxBus.connect(comp);
      musicBus.connect(comp);
      comp.connect(master);
      master.connect(ctx.destination);
      applyLevels();

      // One noise buffer, reused everywhere - allocating per shot is what makes
      // WebAudio games stutter.
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < data.length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        data[i] = (seed / 4294967296) * 2 - 1;
      }
      unlocked = true;
      if (currentTrack) music(currentTrack, true);
    } catch {
      ctx = null;
    }
    if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
  }

  function applyLevels() {
    if (!ctx) return;
    master.gain.value = levels.master;
    sfxBus.gain.value = levels.sfx;
    musicBus.gain.value = levels.music;
  }

  function setVolume(m, s, mu) {
    if (typeof m === 'number') levels.master = m;
    if (typeof s === 'number') levels.sfx = s;
    if (typeof mu === 'number') levels.music = mu;
    applyLevels();
  }

  function setListener(pos, yaw) {
    if (pos) { listener.pos.x = pos.x; listener.pos.y = pos.y; listener.pos.z = pos.z; }
    if (typeof yaw === 'number') listener.yaw = yaw;
  }

  function setTension(v) { tension = Math.max(0, Math.min(1, v || 0)); }

  // ---------------------------------------------------------- voice plumbing
  /**
   * Build the output chain for one cue: gain -> [pan, lowpass] -> sfx bus.
   * Distance rolls the volume off and closes a lowpass, so a shot two rooms
   * away reads as muffled rather than merely quiet.
   */
  function voice(opts = {}) {
    if (!ctx) return null;
    if (voices >= MAX_VOICES) return null;
    voices++;

    const gain = ctx.createGain();
    let node = gain;

    if (opts.pos) {
      const dx = opts.pos.x - listener.pos.x;
      const dy = (opts.pos.y ?? 0) - listener.pos.y;
      const dz = opts.pos.z - listener.pos.z;
      const dist = Math.hypot(dx, dy, dz);
      const maxDist = opts.maxDist ?? 42;
      if (dist > maxDist) { voices--; return null; }

      const atten = 1 / (1 + dist * dist * 0.012);
      gain.gain.value = (opts.volume ?? 1) * atten;

      // Which side is it on, in the listener's frame?
      const cos = Math.cos(listener.yaw), sin = Math.sin(listener.yaw);
      const right = dx * cos - dz * sin;
      const pan = Math.max(-1, Math.min(1, right / Math.max(1.5, dist)));
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (panner) {
        panner.pan.value = pan;
        node.connect(panner);
        node = panner;
      }
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.max(700, 16000 - dist * 340);
      node.connect(lp);
      node = lp;
    } else {
      gain.gain.value = opts.volume ?? 1;
    }

    node.connect(opts.bus || sfxBus);
    return gain;
  }

  function release(when) {
    const ms = Math.max(60, (when - ctx.currentTime) * 1000 + 120);
    setTimeout(() => { voices = Math.max(0, voices - 1); }, ms);
  }

  function osc(type, freq, out, t0, dur, gainCurve) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    gainCurve(g.gain, t0, dur);
    o.connect(g);
    g.connect(out);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    return { o, g };
  }

  function noise(out, t0, dur, { filter = 'bandpass', freq = 1200, q = 1, gain = 1, sweep = 0 } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t0);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
    return { src, g };
  }

  const decay = (param, t0, dur, peak = 1) => {
    param.linearRampToValueAtTime(peak, t0 + 0.006);
    param.exponentialRampToValueAtTime(0.0008, t0 + dur);
  };

  // ------------------------------------------------------------------ cues --
  const CUES = {
    shot(out, t, opts) {
      // A wet pneumatic thwip: pitched thump, air hiss, and a wobble on top.
      const gun = opts.gun || 'standard';
      const base = { standard: 320, express: 420, scatter: 190, marksman: 250, pulse: 360 }[gun] || 320;
      const dur = gun === 'scatter' ? 0.26 : 0.16;
      const { o } = osc('triangle', base, out, t, dur, (g) => decay(g, t, dur, 0.7));
      o.frequency.exponentialRampToValueAtTime(base * 0.35, t + dur * 0.8);
      noise(out, t, dur * 0.8, { filter: 'bandpass', freq: 2400, q: 0.8, gain: 0.5, sweep: 0.25 });
      const { o: o2 } = osc('sine', base * 2.4, out, t, 0.07, (g) => decay(g, t, 0.07, 0.25));
      o2.frequency.exponentialRampToValueAtTime(base * 1.1, t + 0.07);
      return dur;
    },
    reload(out, t) {
      noise(out, t, 0.06, { filter: 'highpass', freq: 2600, gain: 0.35 });
      noise(out, t + 0.12, 0.05, { filter: 'bandpass', freq: 900, q: 2, gain: 0.4 });
      osc('square', 180, out, t + 0.3, 0.05, (g) => decay(g, t + 0.3, 0.05, 0.18));
      noise(out, t + 0.34, 0.08, { filter: 'lowpass', freq: 1400, gain: 0.45 });
      return 0.45;
    },
    tag(out, t) {
      // The hit confirm. Splat, then a rising two-note sting.
      noise(out, t, 0.18, { filter: 'lowpass', freq: 1800, gain: 0.8, sweep: 0.2 });
      const { o } = osc('sine', 520, out, t, 0.22, (g) => decay(g, t, 0.22, 0.5));
      o.frequency.exponentialRampToValueAtTime(880, t + 0.12);
      osc('triangle', 1320, out, t + 0.09, 0.2, (g) => decay(g, t + 0.09, 0.2, 0.28));
      return 0.32;
    },
    splash(out, t) {
      noise(out, t, 0.22, { filter: 'lowpass', freq: 1200, gain: 0.5, sweep: 0.25 });
      osc('sine', 190, out, t, 0.14, (g) => decay(g, t, 0.14, 0.22));
      return 0.24;
    },
    footstep(out, t, opts) {
      const stance = opts.stance | 0;
      const soft = stance > 0;
      const f = soft ? 420 : 720;
      // Jitter so a run does not machine-gun the same click.
      const j = 0.85 + ((t * 977) % 1) * 0.3;
      noise(out, t, soft ? 0.06 : 0.08, {
        filter: 'bandpass', freq: f * j, q: 1.4, gain: soft ? 0.16 : 0.3, sweep: 0.5,
      });
      osc('sine', 92 * j, out, t, 0.05, (g) => decay(g, t, 0.05, soft ? 0.06 : 0.13));
      return 0.1;
    },
    land(out, t) {
      noise(out, t, 0.14, { filter: 'lowpass', freq: 620, gain: 0.5, sweep: 0.4 });
      osc('sine', 70, out, t, 0.16, (g) => decay(g, t, 0.16, 0.4));
      return 0.18;
    },
    paint(out, t) {
      noise(out, t, 0.3, { filter: 'highpass', freq: 3200, gain: 0.22, sweep: 1.6 });
      return 0.32;
    },
    uiClick(out, t) {
      osc('square', 660, out, t, 0.05, (g) => decay(g, t, 0.05, 0.12));
      return 0.06;
    },
    uiHover(out, t) {
      osc('sine', 980, out, t, 0.04, (g) => decay(g, t, 0.04, 0.06));
      return 0.05;
    },
    countdown(out, t, opts) {
      const step = opts.step ?? 0;
      osc('sine', 640 + step * 90, out, t, 0.12, (g) => decay(g, t, 0.12, 0.24));
      return 0.14;
    },
    phasePrep(out, t) {
      for (const [i, f] of [392, 523, 659].entries()) {
        osc('triangle', f, out, t + i * 0.11, 0.4, (g) => decay(g, t + i * 0.11, 0.4, 0.2));
      }
      return 0.7;
    },
    phaseHunt(out, t) {
      // Release klaxon: two descending blasts with a snarl underneath.
      for (const i of [0, 1]) {
        const t0 = t + i * 0.38;
        const { o } = osc('sawtooth', 300, out, t0, 0.32, (g) => decay(g, t0, 0.32, 0.28));
        o.frequency.exponentialRampToValueAtTime(180, t0 + 0.3);
        osc('square', 150, out, t0, 0.3, (g) => decay(g, t0, 0.3, 0.12));
      }
      noise(out, t, 0.8, { filter: 'lowpass', freq: 400, gain: 0.14 });
      return 0.9;
    },
    win(out, t) {
      [523, 659, 784, 1047].forEach((f, i) => {
        osc('triangle', f, out, t + i * 0.11, 0.45, (g) => decay(g, t + i * 0.11, 0.45, 0.22));
      });
      return 0.9;
    },
    lose(out, t) {
      [392, 330, 262].forEach((f, i) => {
        osc('sine', f, out, t + i * 0.16, 0.5, (g) => decay(g, t + i * 0.16, 0.5, 0.22));
      });
      return 0.9;
    },
    scan(out, t) {
      const { o } = osc('sine', 1400, out, t, 0.9, (g) => {
        g.linearRampToValueAtTime(0.3, t + 0.05);
        g.exponentialRampToValueAtTime(0.0008, t + 0.9);
      });
      o.frequency.exponentialRampToValueAtTime(280, t + 0.85);
      noise(out, t, 0.5, { filter: 'bandpass', freq: 2000, q: 6, gain: 0.12, sweep: 0.2 });
      return 0.95;
    },
    heartbeat(out, t) {
      for (const [i, d] of [0, 0.19].entries()) {
        const t0 = t + d;
        const { o } = osc('sine', 62, out, t0, 0.16, (g) => decay(g, t0, 0.16, i ? 0.24 : 0.34));
        o.frequency.exponentialRampToValueAtTime(38, t0 + 0.15);
      }
      return 0.45;
    },
    emote(out, t) {
      const { o } = osc('triangle', 520, out, t, 0.18, (g) => decay(g, t, 0.18, 0.16));
      o.frequency.exponentialRampToValueAtTime(880, t + 0.16);
      return 0.2;
    },
  };

  function play(name, opts = {}) {
    if (!ctx || !unlocked) return;
    const cue = CUES[name];
    if (!cue) return;
    const out = voice(opts);
    if (!out) return;
    try {
      const t = ctx.currentTime + 0.001;
      const dur = cue(out, t, opts) || 0.3;
      release(t + dur);
    } catch {
      voices = Math.max(0, voices - 1);
    }
  }

  // ------------------------------------------------------------------ music --
  const TRACKS = {
    menu: { root: 220, chord: [0, 3, 7, 10], rate: 0.22, pulse: 0, pad: 0.16 },
    prep: { root: 196, chord: [0, 5, 7, 12], rate: 0.3, pulse: 0.4, pad: 0.13 },
    hunt: { root: 165, chord: [0, 3, 6, 10], rate: 0.5, pulse: 1, pad: 0.11 },
  };

  function stopMusic(fade = 1.2) {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const node of musicNodes) {
      try {
        node.gain.gain.cancelScheduledValues(t);
        node.gain.gain.setValueAtTime(node.gain.gain.value, t);
        node.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
        node.stop?.(t + fade + 0.1);
        for (const o of node.oscs || []) o.stop(t + fade + 0.1);
        if (node.timer) clearInterval(node.timer);
      } catch { /* already stopped */ }
    }
    musicNodes = [];
  }

  function music(track, force = false) {
    currentTrack = track;
    if (!ctx || !unlocked) return;
    if (!track) { stopMusic(); return; }
    if (!force && musicNodes.length && musicNodes.track === track) return;
    const spec = TRACKS[track] || TRACKS.menu;
    stopMusic(0.9);

    const t0 = ctx.currentTime + 0.05;
    const bed = ctx.createGain();
    bed.gain.setValueAtTime(0.0001, t0);
    bed.gain.linearRampToValueAtTime(spec.pad, t0 + 2.0);
    bed.connect(musicBus);

    // Slow detuned pad: three saws per chord tone, barely out of tune with
    // each other, through a gentle lowpass.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.7;
    filter.connect(bed);

    const oscs = [];
    for (const semi of spec.chord) {
      const freq = spec.root * Math.pow(2, semi / 12);
      for (const detune of [-6, 0, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = freq;
        o.detune.value = detune;
        const g = ctx.createGain();
        g.gain.value = 0.055;
        o.connect(g); g.connect(filter);
        o.start(t0);
        oscs.push(o);
      }
    }

    // A pulse that tightens with tension, and a sparse arpeggio over the top.
    const pulseGain = ctx.createGain();
    pulseGain.gain.value = 0;
    pulseGain.connect(bed);
    let step = 0;
    const timer = setInterval(() => {
      if (!ctx) return;
      const t = ctx.currentTime;
      const intensity = spec.pulse * (0.4 + tension * 0.9);
      if (intensity > 0.02) {
        const { o } = osc('sine', spec.root * 0.5, pulseGain, t, 0.18,
          (g) => decay(g, t, 0.18, 0.22 * intensity));
        o.frequency.exponentialRampToValueAtTime(spec.root * 0.35, t + 0.17);
      }
      if (step % 4 === 0) {
        const note = spec.chord[(step / 4) % spec.chord.length];
        const f = spec.root * 4 * Math.pow(2, note / 12);
        osc('triangle', f, bed, t, 0.5, (g) => decay(g, t, 0.5, 0.05 + tension * 0.04));
      }
      filter.frequency.setTargetAtTime(700 + tension * 1800, t, 0.4);
      step++;
    }, Math.max(120, 1000 / (spec.rate * 4 + 1)));

    musicNodes = [{ gain: bed, oscs, timer }];
    musicNodes.track = track;
  }

  return {
    unlock,
    play,
    music,
    setListener,
    setVolume,
    setTension,
    get levels() { return { ...levels }; },
    get ready() { return !!ctx && unlocked; },
    get voices() { return voices; },
    suspend() { ctx?.suspend?.().catch(() => {}); },
    resume() { ctx?.resume?.().catch(() => {}); },
    dispose() { stopMusic(0.1); ctx?.close?.().catch(() => {}); ctx = null; unlocked = false; },
  };
}
