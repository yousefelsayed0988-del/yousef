// The paint screen: an HSV wheel, the map's palette, a live sample of the
// surfaces you are actually standing next to, per-part selection and patterns.
// Everything writes into one paint object that the client then ships to the
// server, which re-scores the camouflage itself.

import { PAINT, POSES } from '../../shared/constants.js';
import { hexToRgb, rgbToHex, hsvToRgb, rgbToHsv } from '../../shared/color.js';
import { clamp, clamp01, formatTime } from '../../shared/math.js';
import { sampleSurroundings } from '../../shared/collision.js';
import { computeBlend, TIER_COLORS } from '../../shared/blend.js';

const $ = (id) => document.getElementById(id);

export function createPaintUI(game) {
  const el = {
    screen: $('paintScreen'), close: $('paintClose'), timer: $('paintTimer'),
    parts: $('partPicker'), patterns: $('patternPicker'),
    wheel: $('colorWheel'), value: $('valueSlider'), hex: $('hexInput'),
    swatch: $('swatchPreview'), mapPalette: $('mapPalette'), nearby: $('nearbyPalette'),
    blendFill: $('paintBlendFill'), blendText: $('paintBlendText'),
    mimic: $('mimicBtn'), copyAll: $('copyAllBtn'),
  };

  const ctx = el.wheel.getContext('2d');
  const SIZE = el.wheel.width;
  let value = 0.7;
  let activePart = 'body';
  let open = false;
  let wheelDirty = true;

  // ------------------------------------------------------------ the wheel --
  function drawWheel() {
    const img = ctx.createImageData(SIZE, SIZE);
    const r = SIZE / 2;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx = (x - r) / r, dy = (y - r) / r;
        const dist = Math.hypot(dx, dy);
        const i = (y * SIZE + x) * 4;
        if (dist > 1) { img.data[i + 3] = 0; continue; }
        const hue = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
        const rgb = hsvToRgb([hue, Math.min(1, dist), value]);
        img.data[i] = rgb[0] * 255;
        img.data[i + 1] = rgb[1] * 255;
        img.data[i + 2] = rgb[2] * 255;
        img.data[i + 3] = 255 * clamp01((1 - dist) * 14 + 1); // soften the rim
      }
    }
    ctx.putImageData(img, 0, 0);
    wheelDirty = false;
  }

  function colorAt(clientX, clientY) {
    const rect = el.wheel.getBoundingClientRect();
    const r = rect.width / 2;
    const dx = (clientX - rect.left - r) / r;
    const dy = (clientY - rect.top - r) / r;
    const dist = Math.hypot(dx, dy);
    if (dist > 1.02) return null;
    const hue = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
    return hsvToRgb([hue, Math.min(1, dist), value]);
  }

  let dragging = false;
  const pick = (e) => {
    const t = e.touches?.[0] || e;
    const c = colorAt(t.clientX, t.clientY);
    if (c) applyColor(c);
  };
  el.wheel.addEventListener('pointerdown', (e) => { dragging = true; el.wheel.setPointerCapture(e.pointerId); pick(e); });
  el.wheel.addEventListener('pointermove', (e) => { if (dragging) pick(e); });
  el.wheel.addEventListener('pointerup', () => { dragging = false; });
  el.wheel.addEventListener('pointercancel', () => { dragging = false; });

  el.value.addEventListener('input', () => {
    value = clamp01(Number(el.value.value) / 100);
    drawWheel();
  });

  el.hex.addEventListener('change', () => {
    const rgb = hexToRgb(el.hex.value.trim());
    applyColor(rgb);
  });

  // ------------------------------------------------------------ the parts --
  function buildParts() {
    el.parts.innerHTML = '';
    for (const part of PAINT.parts) {
      const b = document.createElement('button');
      b.className = `part-btn${part === activePart ? ' sel' : ''}`;
      b.dataset.part = part;
      b.innerHTML = `${part}<span class="chip"></span>`;
      b.addEventListener('click', () => { activePart = part; refresh(); });
      el.parts.appendChild(b);
    }
  }

  function buildPatterns() {
    el.patterns.innerHTML = '';
    for (const pattern of PAINT.patterns) {
      const b = document.createElement('button');
      b.className = 'pattern-btn';
      b.dataset.pattern = pattern;
      b.textContent = pattern;
      b.addEventListener('click', () => {
        game.paint.pattern = pattern;
        commit();
        refresh();
      });
      el.patterns.appendChild(b);
    }
  }

  function swatchButton(rgb, onClick, title) {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = rgbToHex(rgb);
    if (title) b.title = title;
    b.addEventListener('click', () => onClick(rgb));
    return b;
  }

  function buildMapPalette() {
    el.mapPalette.innerHTML = '';
    for (const c of (game.mapDef?.palette || []).slice(0, 18)) {
      el.mapPalette.appendChild(swatchButton(c, applyColor, rgbToHex(c)));
    }
  }

  /** The eyedropper: what is physically around the player right now. */
  function refreshNearby() {
    if (!game.world) return;
    const samples = sampleSurroundings(game.world, game.me.pos, PAINT.sampleRadius, 12);
    el.nearby.innerHTML = '';
    const seen = new Set();
    for (const s of samples) {
      const hex = rgbToHex(s.color);
      if (seen.has(hex)) continue;
      seen.add(hex);
      el.nearby.appendChild(swatchButton(s.color, applyColor, `${hex} · ${s.dist.toFixed(1)}m away`));
      if (seen.size >= 12) break;
    }
    if (!seen.size) {
      el.nearby.innerHTML = '<p class="muted" style="grid-column:1/-1;font-size:12px">Nothing close enough to sample. Get next to something.</p>';
    }
  }

  function applyColor(rgb) {
    game.paint[activePart] = rgb.slice();
    // Keep the eyes readable rather than letting them vanish into the body.
    if (activePart === 'body' && game.paint.linkParts !== false) {
      const hsv = rgbToHsv(rgb);
      game.paint.head = hsvToRgb([hsv[0], hsv[1], clamp01(hsv[2] * 1.06)]);
      game.paint.tail = hsvToRgb([hsv[0], hsv[1], clamp01(hsv[2] * 0.93)]);
      game.paint.legs = hsvToRgb([hsv[0], hsv[1], clamp01(hsv[2] * 0.87)]);
      game.paint.crest = hsvToRgb([hsv[0], clamp01(hsv[1] * 1.1), clamp01(hsv[2] * 1.12)]);
      game.paint.patternColor = hsvToRgb([hsv[0], hsv[1], clamp01(hsv[2] * 0.78)]);
    }
    commit();
    refresh();
  }

  let commitTimer = null;
  function commit() {
    // Coalesce drags into one message rather than one per pointermove.
    if (commitTimer) return;
    commitTimer = setTimeout(() => {
      commitTimer = null;
      game.sendPaint();
    }, 70);
  }

  el.mimic.addEventListener('click', () => game.useAbility('mimic'));
  el.copyAll.addEventListener('click', () => {
    const c = game.paint[activePart];
    for (const part of PAINT.parts) {
      if (part === 'eyes') continue;
      game.paint[part] = c.slice();
    }
    commit();
    refresh();
  });
  el.close.addEventListener('click', () => setOpen(false));

  // ------------------------------------------------------------- refresh --
  function refresh() {
    if (!open) return;
    if (wheelDirty) drawWheel();
    for (const b of el.parts.children) {
      b.classList.toggle('sel', b.dataset.part === activePart);
      const chip = b.querySelector('.chip');
      if (chip) chip.style.background = rgbToHex(game.paint[b.dataset.part] || [1, 1, 1]);
    }
    for (const b of el.patterns.children) {
      b.classList.toggle('sel', b.dataset.pattern === game.paint.pattern);
    }
    const cur = game.paint[activePart] || [1, 1, 1];
    el.swatch.style.background = rgbToHex(cur);
    if (document.activeElement !== el.hex) el.hex.value = rgbToHex(cur).toUpperCase();

    if (game.world) {
      const b = computeBlend(game.world, game.me.pos, game.paint);
      el.blendFill.style.width = `${b.score * 100}%`;
      el.blendFill.style.background = TIER_COLORS[b.tier];
      el.blendText.textContent = {
        perfect: 'Perfect match. Now hold still.',
        good: 'Good. Break your outline with a pose.',
        ok: 'Passable at a distance. Get closer to cover.',
        poor: 'You stand out. Sample something nearby.',
      }[b.tier];
      el.blendText.style.color = TIER_COLORS[b.tier];
    }
  }

  function setOpen(v) {
    open = v;
    el.screen.classList.toggle('hidden', !v);
    if (v) {
      buildMapPalette();
      refreshNearby();
      refresh();
      game.input.releaseLock();
    } else {
      game.requestLock();
    }
    game.onPaintScreenToggled?.(v);
  }

  function tick() {
    if (!open) return;
    el.timer.textContent = formatTime(game.timeLeft);
    if ((tick.frame = (tick.frame || 0) + 1) % 20 === 0) {
      refreshNearby();
      refresh();
    }
  }

  buildParts();
  buildPatterns();

  return {
    get open() { return open; },
    setOpen,
    toggle: () => setOpen(!open),
    refresh,
    refreshNearby,
    tick,
    rebuildPalette: buildMapPalette,
  };
}

/** Radial pose / emote picker, shared by both wheels. */
export function createWheel(elementId, items, onPick) {
  const root = document.getElementById(elementId);
  let open = false;

  function build(selectedId) {
    root.innerHTML = '';
    const n = items.length;
    items.forEach((item, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const b = document.createElement('button');
      b.className = `opt-btn${item.id === selectedId ? ' sel' : ''}`;
      b.style.left = `calc(50% + ${Math.cos(angle) * 190}px - 52px)`;
      b.style.top = `calc(50% + ${Math.sin(angle) * 190}px - 52px)`;
      b.innerHTML = `<b>${item.name}</b>`;
      b.addEventListener('click', () => { onPick(item.id); setOpen(false); });
      root.appendChild(b);
    });
  }

  function setOpen(v, selectedId) {
    open = v;
    root.classList.toggle('hidden', !v);
    if (v) build(selectedId);
  }

  return { get open() { return open; }, setOpen, toggle: (sel) => setOpen(!open, sel) };
}
