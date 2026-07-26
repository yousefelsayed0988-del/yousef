// Procedural audio. Every sound is synthesised with oscillators and shaped
// noise -- there are no audio files in this project. Material-aware footsteps
// and digging come from swapping the noise filter and envelope per block sound
// group.

import { CONFIG } from '../core/config.js';
import { BLOCKS } from '../core/blocks.js';

const MATERIAL = {
  stone: { type: 'noise', freq: 900, q: 2.2, decay: 0.09, gain: 0.5 },
  wood: { type: 'noise', freq: 520, q: 1.6, decay: 0.11, gain: 0.55 },
  gravel: { type: 'noise', freq: 1400, q: 0.9, decay: 0.13, gain: 0.45 },
  sand: { type: 'noise', freq: 2200, q: 0.7, decay: 0.14, gain: 0.35 },
  grass: { type: 'noise', freq: 1800, q: 0.8, decay: 0.10, gain: 0.35 },
  glass: { type: 'tone', freq: 2400, decay: 0.12, gain: 0.35 },
  wool: { type: 'noise', freq: 400, q: 0.6, decay: 0.13, gain: 0.30 },
  snow: { type: 'noise', freq: 2600, q: 0.6, decay: 0.10, gain: 0.28 },
  metal: { type: 'tone', freq: 1400, decay: 0.14, gain: 0.30 },
  water: { type: 'noise', freq: 700, q: 0.8, decay: 0.18, gain: 0.30 },
  lava: { type: 'noise', freq: 180, q: 0.8, decay: 0.30, gain: 0.30 },
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.enabled = true;
    this.lastPlay = new Map();
    this.musicTimer = 0;
    this.musicNode = null;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return null; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = CONFIG.masterVolume;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = CONFIG.musicVolume;
    this.musicGain.connect(this.master);
    return this.ctx;
  }

  resume() {
    const c = this.ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  setVolume(v) {
    CONFIG.masterVolume = v;
    if (this.master) this.master.gain.value = v;
  }

  _noiseBuffer(dur) {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Filtered noise burst -- the workhorse for impacts and steps. */
  noise(freq, q, decay, gain, pan = 0) {
    const ctx = this.ensure();
    if (!ctx || !this.enabled) return;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(decay + 0.02);
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + decay + 0.02);
  }

  tone(freq, decay, gain, type = 'sine', slideTo = null) {
    const ctx = this.ensure();
    if (!ctx || !this.enabled) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + decay + 0.02);
  }

  throttle(key, ms) {
    const now = performance.now();
    const last = this.lastPlay.get(key) || 0;
    if (now - last < ms) return false;
    this.lastPlay.set(key, now);
    return true;
  }

  material(def) { return MATERIAL[def && def.sound ? def.sound : 'stone'] || MATERIAL.stone; }

  /** `progress` 0..1 lifts the pitch as the block gives way. */
  dig(def, progress = 0) {
    if (!this.throttle('dig', 110)) return;
    const m = this.material(def);
    const rise = 1 + progress * 0.55;
    if (m.type === 'tone') this.tone(m.freq * rise * (0.9 + Math.random() * 0.2), m.decay, m.gain * 0.35, 'triangle');
    else this.noise(m.freq * rise * (0.85 + Math.random() * 0.3), m.q, m.decay * 0.7, m.gain * (0.32 + progress * 0.2));
  }

  break(def) {
    const m = this.material(def);
    if (m.type === 'tone') this.tone(m.freq, m.decay * 1.6, m.gain * 0.7, 'triangle', m.freq * 0.4);
    else this.noise(m.freq * 0.8, m.q * 0.7, m.decay * 2.0, m.gain * 0.8);
  }

  place(def) {
    const m = this.material(def);
    if (m.type === 'tone') this.tone(m.freq * 0.8, m.decay, m.gain * 0.6, 'triangle');
    else this.noise(m.freq * 0.7, m.q, m.decay * 1.2, m.gain * 0.6);
  }

  footstep(blockIdValue) {
    if (!this.throttle('step', 240)) return;
    const def = BLOCKS[blockIdValue];
    const m = this.material(def);
    this.noise(m.freq * (0.55 + Math.random() * 0.2), m.q * 0.6, 0.06, m.gain * 0.30);
  }

  play(name) {
    switch (name) {
      case 'hurt': this.tone(340, 0.18, 0.30, 'square', 180); break;
      case 'hit': this.noise(700, 1.2, 0.07, 0.35); break;
      case 'mob_hurt': this.tone(240, 0.16, 0.22, 'sawtooth', 150); break;
      case 'mob_death': this.tone(200, 0.35, 0.25, 'sawtooth', 70); break;
      case 'mob_attack': this.noise(400, 1.0, 0.09, 0.30); break;
      case 'eat': this.noise(300, 1.5, 0.05, 0.18); break;
      case 'burp': this.tone(150, 0.22, 0.20, 'sawtooth', 90); break;
      case 'bow': this.tone(900, 0.14, 0.20, 'triangle', 400); break;
      case 'shield': this.tone(520, 0.14, 0.24, 'square', 340); break;
      case 'door': this.tone(220, 0.22, 0.20, 'triangle', 300); break;
      case 'till': this.noise(900, 1.0, 0.14, 0.32); break;
      case 'ignite': this.noise(2400, 0.8, 0.16, 0.28); break;
      case 'splash': this.noise(800, 0.7, 0.22, 0.30); break;
      case 'shear': this.noise(2600, 2.0, 0.10, 0.26); break;
      case 'fuse': this.tone(1000, 0.10, 0.28, 'square'); break;
      case 'explode': this.explosion(); break;
      case 'break_tool': this.tone(500, 0.20, 0.26, 'square', 120); break;
      case 'pickup': this.tone(880, 0.08, 0.14, 'sine', 1320); break;
      case 'craft': this.tone(660, 0.10, 0.16, 'triangle', 880); break;
      case 'levelup': this.tone(523, 0.18, 0.2, 'sine', 1046); break;
      case 'thunder': this.thunder(); break;
      case 'open': this.tone(300, 0.10, 0.12, 'sine', 420); break;
      case 'close': this.tone(420, 0.10, 0.12, 'sine', 300); break;
      default: break;
    }
  }

  explosion() {
    const ctx = this.ensure();
    if (!ctx || !this.enabled) return;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.9);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    const t = ctx.currentTime;
    filt.frequency.setValueAtTime(1800, t);
    filt.frequency.exponentialRampToValueAtTime(90, t + 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.75, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.95);
  }

  thunder() {
    const ctx = this.ensure();
    if (!ctx || !this.enabled) return;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(2.2);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    const t = ctx.currentTime;
    filt.frequency.setValueAtTime(400, t);
    filt.frequency.exponentialRampToValueAtTime(60, t + 2.0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.1);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 2.2);
  }

  /** Slow ambient pads; deliberately sparse so it never gets grating. */
  tickMusic(dt, night) {
    if (!this.ctx || CONFIG.musicVolume <= 0) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 24 + Math.random() * 40;
    const scale = night ? [220, 261.6, 293.7, 349.2, 392] : [261.6, 293.7, 329.6, 392, 440];
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = scale[Math.floor(Math.random() * scale.length)] * (i === 0 ? 0.5 : 1);
      const g = ctx.createGain();
      const start = t + i * 1.6 + Math.random();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.09, start + 1.6);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 6.5);
      osc.connect(g); g.connect(this.musicGain);
      osc.start(start); osc.stop(start + 7);
    }
  }

  /** Continuous rain bed, faded in and out with weather intensity. */
  setRain(intensity) {
    const ctx = this.ensure();
    if (!ctx || !this.enabled) return;
    if (intensity <= 0.01) {
      if (this.rainSrc) { try { this.rainSrc.stop(); } catch { } this.rainSrc = null; this.rainGain = null; }
      return;
    }
    if (!this.rainSrc) {
      const src = ctx.createBufferSource();
      src.buffer = this._noiseBuffer(3);
      src.loop = true;
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass'; filt.frequency.value = 3200; filt.Q.value = 0.4;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(filt); filt.connect(g); g.connect(this.master);
      src.start();
      this.rainSrc = src; this.rainGain = g;
    }
    this.rainGain.gain.setTargetAtTime(0.10 * intensity, ctx.currentTime, 1.2);
  }
}
