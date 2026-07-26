// The in-game overlay: timers, camouflage meter, ammo, killfeed, scoreboard,
// minimap and floating name tags. Pure DOM - it reads game state and writes
// elements, and never reaches back into the simulation.

import { Phase, PhaseName, Role, StanceName, GUNS, ABILITY, HIDER_ABILITY } from '../../shared/constants.js';
import { TIER_COLORS } from '../../shared/blend.js';
import { formatTime, clamp01 } from '../../shared/math.js';
import { rgbToHex } from '../../shared/color.js';

const $ = (id) => document.getElementById(id);

export function createHUD(game) {
  const el = {
    hud: $('hud'), phaseName: $('phaseName'), phaseTimer: $('phaseTimer'),
    hiderCount: $('hiderCount'), hunterCount: $('hunterCount'), roundInfo: $('roundInfo'),
    blendFill: $('blendFill'), blendTier: $('blendTier'), blendHint: $('blendHint'),
    blendPanel: $('blendPanel'), stanceName: $('stanceName'), staminaFill: $('staminaFill'),
    gunPanel: $('gunPanel'), gunName: $('gunName'), ammoCount: $('ammoCount'), ammoMax: $('ammoMax'),
    reloadBar: $('reloadBar'), reloadFill: $('reloadFill'), abilityPanel: $('abilityPanel'),
    killfeed: $('killfeed'), banner: $('banner'), objective: $('objective'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'), damageFlash: $('damageFlash'),
    scoreboard: $('scoreboard'), sbBody: $('sbBody'), sbRoom: $('sbRoom'),
    chatLog: $('chatLog'), chatForm: $('chatForm'), chatInput: $('chatInput'),
    minimap: $('minimap'), minimapCanvas: $('minimapCanvas'), nameTags: $('nameTags'),
    perf: $('perf'),
  };

  const mini = el.minimapCanvas.getContext('2d');
  let miniBase = null;      // pre-rendered map, redrawn only when the map changes
  let miniBaseId = null;
  let miniScale = 1, miniOx = 0, miniOz = 0;
  const tagPool = [];
  let bannerTimer = null;

  function show(on) { el.hud.classList.toggle('hidden', !on); }

  // ------------------------------------------------------------- minimap --
  function buildMinimap(mapDef) {
    if (miniBaseId === mapDef.id) return;
    miniBaseId = mapDef.id;
    const size = 192;
    const b = mapDef.bounds;
    const w = b.maxX - b.minX, d = b.maxZ - b.minZ;
    miniScale = Math.min(size / w, size / d) * 0.94;
    miniOx = size / 2 - ((b.minX + b.maxX) / 2) * miniScale;
    miniOz = size / 2 - ((b.minZ + b.maxZ) / 2) * miniScale;

    miniBase = document.createElement('canvas');
    miniBase.width = miniBase.height = size;
    const c = miniBase.getContext('2d');
    c.fillStyle = '#0b0e13';
    c.fillRect(0, 0, size, size);
    // Draw props darkest-first so walls read above floors.
    const props = [...mapDef.props].sort((p, q) => (p.p[1] + p.s[1]) - (q.p[1] + q.s[1]));
    for (const p of props) {
      if (p.tag === 'ceiling') continue;
      const top = p.p[1] + p.s[1];
      if (top > 6) continue;
      const alpha = clamp01(0.18 + top * 0.12);
      c.fillStyle = `rgba(${(p.c[0] * 255) | 0},${(p.c[1] * 255) | 0},${(p.c[2] * 255) | 0},${alpha})`;
      const x = miniOx + p.p[0] * miniScale;
      const z = miniOz + p.p[2] * miniScale;
      const sw = Math.max(1.2, p.s[0] * 2 * miniScale);
      const sd = Math.max(1.2, p.s[2] * 2 * miniScale);
      c.save();
      c.translate(x, z);
      c.rotate(-(p.yaw || 0));
      c.fillRect(-sw / 2, -sd / 2, sw, sd);
      c.restore();
    }
  }

  function drawMinimap(state) {
    if (!miniBase) return;
    mini.clearRect(0, 0, 192, 192);
    mini.drawImage(miniBase, 0, 0);

    const dot = (x, z, color, r = 3) => {
      mini.beginPath();
      mini.arc(miniOx + x * miniScale, miniOz + z * miniScale, r, 0, Math.PI * 2);
      mini.fillStyle = color;
      mini.fill();
    };

    for (const p of state.others.values()) {
      if (!p.alive) continue;
      dot(p.render.x, p.render.z, p.role === Role.SEEKER ? '#ffb347' : '#7cf2c4', 2.6);
    }
    // Own marker with a heading wedge.
    const me = state.me;
    const mx = miniOx + me.pos.x * miniScale;
    const mz = miniOz + me.pos.z * miniScale;
    mini.save();
    mini.translate(mx, mz);
    mini.rotate(-me.yaw);
    mini.beginPath();
    mini.moveTo(0, -7); mini.lineTo(4.5, 4); mini.lineTo(-4.5, 4);
    mini.closePath();
    mini.fillStyle = '#ffffff';
    mini.fill();
    mini.restore();
  }

  // ----------------------------------------------------------- name tags --
  function updateNameTags(state, renderer) {
    let used = 0;
    const showTags = state.phase === Phase.LOBBY || state.phase === Phase.INTERMISSION ||
      state.phase === Phase.ROUND_END || state.myRole === Role.SEEKER;
    if (showTags) {
      for (const p of state.others.values()) {
        if (!p.alive) continue;
        // Hunters see each other's tags; hiders stay anonymous while hunted.
        const sameTeam = p.role === state.myRole;
        if (state.phase === Phase.HUNT && !sameTeam) continue;
        const s = renderer.worldToScreen({ x: p.render.x, y: p.render.y + 1.5, z: p.render.z });
        if (!s.visible || s.depth > 45) continue;
        let tag = tagPool[used];
        if (!tag) {
          tag = document.createElement('div');
          tag.className = 'name-tag';
          el.nameTags.appendChild(tag);
          tagPool.push(tag);
        }
        tag.style.display = '';
        tag.style.left = `${s.x}px`;
        tag.style.top = `${s.y}px`;
        tag.style.opacity = String(clamp01(1 - s.depth / 45));
        tag.textContent = p.name || '';
        used++;
      }
    }
    for (let i = used; i < tagPool.length; i++) tagPool[i].style.display = 'none';
  }

  // ---------------------------------------------------------- main update --
  function update(state, renderer, dt) {
    const phaseLabel = {
      [Phase.LOBBY]: 'Lobby', [Phase.INTERMISSION]: 'Next round',
      [Phase.PREP]: 'Hide', [Phase.HUNT]: 'Hunt',
      [Phase.ROUND_END]: 'Round over', [Phase.MATCH_END]: 'Match over',
    }[state.phase] || PhaseName[state.phase] || '';
    el.phaseName.textContent = phaseLabel;
    el.phaseTimer.textContent = formatTime(state.timeLeft);
    el.phaseTimer.classList.toggle('urgent', state.timeLeft <= 10 && state.phase === Phase.HUNT);
    el.hiderCount.textContent = state.hiders;
    el.hunterCount.textContent = state.hunters;
    el.roundInfo.textContent = state.roundInfo || '';

    const isHider = state.myRole === Role.HIDER;
    el.blendPanel.classList.toggle('hidden', !isHider || !state.alive);
    el.gunPanel.classList.toggle('hidden', state.myRole !== Role.SEEKER || !state.alive);
    el.crosshair.classList.toggle('hidden', state.myRole !== Role.SEEKER || !state.alive || state.thirdPerson);

    if (isHider) {
      const pct = clamp01(state.blend) * 100;
      el.blendFill.style.width = `${pct}%`;
      el.blendFill.style.background = TIER_COLORS[state.blendTier] || '#ff6b6b';
      el.blendTier.textContent = {
        perfect: 'Perfect', good: 'Good', ok: 'Passable', poor: 'Obvious',
      }[state.blendTier] || '–';
      el.blendTier.style.color = TIER_COLORS[state.blendTier] || '#ff6b6b';
      el.blendHint.textContent = state.blendHint || '';
    }

    el.stanceName.textContent = StanceName[state.stance] || 'Standing';
    el.staminaFill.style.width = `${clamp01(state.stamina / 100) * 100}%`;

    if (state.myRole === Role.SEEKER) {
      const g = GUNS[state.gun] || GUNS.standard;
      el.gunName.textContent = g.name;
      el.ammoCount.textContent = state.ammo;
      el.ammoMax.textContent = `/${state.ammoMax ?? g.mag}`;
      const reloading = state.reload > 0;
      el.reloadBar.classList.toggle('hidden', !reloading);
      if (reloading) el.reloadFill.style.width = `${(1 - state.reload / g.reload) * 100}%`;
    }

    updateAbilities(state);
    drawMinimap(state);
    updateNameTags(state, renderer);
  }

  const abilityEls = new Map();
  function updateAbilities(state) {
    const list = state.myRole === Role.SEEKER
      ? [{ ...ABILITY.scan, key: 'X' }, { ...ABILITY.thermal, key: 'C' }]
      : [{ ...HIDER_ABILITY.mimic, key: 'T' }, { ...HIDER_ABILITY.decoy, key: 'C' }, { ...HIDER_ABILITY.dash, key: 'V' }];
    for (const a of list) {
      let node = abilityEls.get(a.id);
      if (!node) {
        node = document.createElement('div');
        node.className = 'ability';
        node.innerHTML = `<span class="key"></span><span class="nm"></span><div class="cool"></div>`;
        el.abilityPanel.appendChild(node);
        abilityEls.set(a.id, node);
      }
      node.style.display = '';
      node.querySelector('.key').textContent = a.key;
      node.querySelector('.nm').textContent = a.name.split(' ')[0];
      const left = Math.max(0, (state.cooldowns?.[a.id] || 0) - state.now);
      const frac = clamp01(left / a.cooldown);
      node.querySelector('.cool').style.transform = `scaleY(${frac})`;
      node.classList.toggle('ready', frac <= 0);
    }
    for (const [id, node] of abilityEls) {
      if (!list.some((a) => a.id === id)) node.style.display = 'none';
    }
  }

  // -------------------------------------------------------------- effects --
  function banner(text, sub, ms = 2600) {
    el.banner.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    el.banner.classList.add('on');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.banner.classList.remove('on'), ms);
  }

  function objective(text) { el.objective.textContent = text || ''; }

  function hitmarker() {
    el.hitmarker.classList.remove('on');
    void el.hitmarker.offsetWidth; // restart the animation
    el.hitmarker.classList.add('on');
  }

  function flash() {
    el.damageFlash.classList.add('on');
    setTimeout(() => el.damageFlash.classList.remove('on'), 40);
  }

  function killfeed(html) {
    const row = document.createElement('div');
    row.className = 'kf';
    row.innerHTML = html;
    el.killfeed.appendChild(row);
    setTimeout(() => row.remove(), 6000);
    while (el.killfeed.children.length > 6) el.killfeed.firstChild.remove();
  }

  function chat(entry) {
    const row = document.createElement('div');
    if (entry.sys) row.innerHTML = `<span class="sys">${escape(entry.text)}</span>`;
    else row.innerHTML = `<span class="who">${escape(entry.from)}</span> ${escape(entry.text)}`;
    el.chatLog.appendChild(row);
    while (el.chatLog.children.length > 8) el.chatLog.firstChild.remove();
    setTimeout(() => row.remove(), 18000);
  }

  const escape = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function scoreboard(rows, myId, roomCode) {
    el.sbRoom.textContent = roomCode ? `Room ${roomCode}` : '';
    el.sbBody.innerHTML = rows.map((r) => `
      <tr class="${r.id === myId ? 'me' : ''}">
        <td>${escape(r.name)}${r.bot ? ' <span class="badge bot">BOT</span>' : ''}</td>
        <td class="${r.role === Role.SEEKER ? 'role-s' : r.role === Role.HIDER ? 'role-h' : 'role-x'}">
          ${r.role === Role.SEEKER ? 'Hunter' : r.role === Role.HIDER ? 'Hider' : 'Out'}</td>
        <td>${r.score}</td><td>${r.tags}</td><td>${r.survived}s</td>
        <td style="color:${TIER_COLORS[tierOf(r.blend)]}">${Math.round(r.blend * 100)}%</td>
      </tr>`).join('');
  }
  const tierOf = (b) => (b >= 0.9 ? 'perfect' : b >= 0.68 ? 'good' : b >= 0.42 ? 'ok' : 'poor');

  function toggleScoreboard(on) { el.scoreboard.classList.toggle('hidden', !on); }
  function toggleMinimap(on) { el.minimap.classList.toggle('hidden', !on); }

  function openChat(on) {
    el.chatForm.classList.toggle('hidden', !on);
    if (on) el.chatInput.focus();
    else el.chatInput.blur();
  }

  function perf(text) {
    el.perf.textContent = text;
  }
  function showPerf(on) { el.perf.classList.toggle('hidden', !on); }

  el.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = el.chatInput.value.trim();
    el.chatInput.value = '';
    openChat(false);
    if (text) game.sendChat(text);
  });
  el.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { el.chatInput.value = ''; openChat(false); }
    e.stopPropagation();
  });

  return {
    show, update, banner, objective, hitmarker, flash, killfeed, chat,
    scoreboard, toggleScoreboard, toggleMinimap, openChat, buildMinimap, perf, showPerf,
    get chatOpen() { return !el.chatForm.classList.contains('hidden'); },
  };
}
