// Screen manager: menu, join, browser, lobby, settings, profile, results.
// It owns no game state - it renders what it is handed and calls back into the
// game for anything that needs to touch the network.

import { MODES, DIFFICULTY, Phase, Role } from '../../shared/constants.js';
import { DEFAULT_BINDS } from './input.js';
import { formatTime } from '../../shared/math.js';

const $ = (id) => document.getElementById(id);
const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const KEY_LABELS = {
  Space: 'Space', ShiftLeft: 'L Shift', ShiftRight: 'R Shift', ControlLeft: 'L Ctrl',
  ControlRight: 'R Ctrl', AltLeft: 'L Alt', Tab: 'Tab', Enter: 'Enter', Escape: 'Esc',
};
const keyLabel = (code) => KEY_LABELS[code] || code?.replace(/^(Key|Digit|Arrow)/, '') || '—';

export function createUI(game) {
  let current = 'boot';
  let previous = 'menu';
  let cbs = {};
  let lastRoom = null;

  function bind(handlers) { cbs = { ...cbs, ...handlers }; }

  function show(screen, data) {
    for (const s of document.querySelectorAll('.screen')) s.classList.remove('on');
    const node = $(`screen-${screen}`);
    if (node) node.classList.add('on');
    if (screen !== current) previous = current;
    current = screen;
    document.body.classList.toggle('playing', screen === 'play');
    $('hud').classList.toggle('hidden', screen !== 'play');
    if (screen === 'browser') cbs.onListRooms?.();
    if (screen === 'settings') renderBinds();
    if (screen === 'profile') renderProfile(data || game.account);
    if (screen === 'help') renderHelpBinds();
    if (screen === 'results') renderResults(data);
  }

  function toast(text, kind = 'info', ms = 4200) {
    const node = document.createElement('div');
    node.className = `toast ${kind}`;
    node.textContent = text;
    $('toasts').appendChild(node);
    setTimeout(() => {
      node.style.opacity = '0';
      node.style.transition = 'opacity .25s';
      setTimeout(() => node.remove(), 260);
    }, ms);
  }

  function bootStatus(text) { $('bootStatus').textContent = text; }
  function netStatus(connected, rtt) {
    const node = $('netStatus');
    node.classList.toggle('on', connected);
    node.textContent = connected ? `connected · ${Math.round(rtt * 1000)}ms` : 'offline';
  }

  // ----------------------------------------------------------------- menu --
  for (const btn of document.querySelectorAll('[data-action]')) {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      switch (action) {
        case 'quick': cbs.onQuickMatch?.(); break;
        case 'create': cbs.onCreateRoom?.({}); break;
        case 'solo': cbs.onCreateRoom?.({ isPrivate: true, bots: 5, solo: true }); break;
        case 'join': show('join'); break;
        case 'browser': show('browser'); break;
        case 'profile': show('profile'); break;
        case 'settings': show('settings'); break;
        case 'help': show('help'); break;
        case 'menu': show('menu'); break;
        case 'back': show(previous === 'settings' ? 'menu' : previous); break;
        default: break;
      }
    });
  }

  $('saveNameBtn').addEventListener('click', () => {
    cbs.onIdentity?.($('nameInput').value.trim(), $('usernameInput').value.trim());
    toast('Saved. Reconnecting with your new handle…', 'good');
  });

  $('joinGo').addEventListener('click', () => {
    const raw = $('joinCode').value.trim();
    const code = (raw.match(/join=([A-Za-z0-9]+)/)?.[1] || raw).toUpperCase();
    if (code) cbs.onJoin?.(code);
  });
  $('joinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('joinGo').click(); });
  $('inviteGo').addEventListener('click', () => {
    const u = $('inviteUser').value.trim();
    if (u) cbs.onInvite?.(u);
  });
  $('refreshRooms').addEventListener('click', () => cbs.onListRooms?.());

  // ---------------------------------------------------------------- lobby --
  function roomState(room) {
    lastRoom = room;
    $('lobbyName').textContent = room.name || 'Room';
    $('lobbyCode').textContent = room.code;
    $('playerCount').textContent = `${room.players.length}/${room.options.maxPlayers}`;

    const isHost = room.host === game.connId;
    for (const node of document.querySelectorAll('.host-only')) node.classList.toggle('off', !isHost);

    renderMaps(room, isHost);
    renderModes(room, isHost);
    renderPlayers(room);

    $('optBots').value = room.options.bots;
    $('optRounds').value = room.options.rounds;
    $('optPrivate').checked = room.isPrivate;
    const diff = $('optDifficulty');
    if (!diff.options.length) {
      diff.innerHTML = DIFFICULTY.map((d, i) => `<option value="${i}">${d}</option>`).join('');
    }
    diff.value = String(room.options.difficulty);

    const me = room.players.find((p) => p.id === room.you);
    $('readyBtn').textContent = me?.ready ? 'Not ready' : 'Ready';
    $('readyBtn').classList.toggle('primary', !me?.ready);
  }

  function renderMaps(room, isHost) {
    const grid = $('mapGrid');
    grid.innerHTML = '';
    for (const m of room.maps || []) {
      const b = document.createElement('button');
      b.className = `map-card${m.id === room.options.mapId ? ' sel' : ''}`;
      b.innerHTML = `
        <div class="thumb" style="--thumb:${thumbFor(m)}"><span class="diff">${'★'.repeat(m.difficulty || 2)}</span></div>
        <div class="meta"><b>${escape(m.name)}</b><small>${escape(m.tagline || m.theme)}</small></div>`;
      b.disabled = !isHost;
      b.addEventListener('click', () => cbs.onSetOption?.({ mapId: m.id }));
      grid.appendChild(b);
    }
  }

  // A cheap, stable colour signature per map so the picker is not grey boxes.
  function thumbFor(m) {
    let h = 0;
    for (let i = 0; i < m.id.length; i++) h = (h * 31 + m.id.charCodeAt(i)) >>> 0;
    const a = h % 360, b = (h >> 8) % 360;
    return `linear-gradient(135deg, hsl(${a} 42% 34%), hsl(${b} 38% 20%))`;
  }

  function renderModes(room, isHost) {
    const list = $('modeList');
    list.innerHTML = '';
    for (const mode of room.modes || Object.values(MODES)) {
      const b = document.createElement('button');
      b.className = `mode-card${mode.id === room.options.modeId ? ' sel' : ''}`;
      b.innerHTML = `<b>${escape(mode.name)}</b><small>${escape(mode.short || mode.desc)}</small>`;
      b.disabled = !isHost;
      b.addEventListener('click', () => cbs.onSetOption?.({ modeId: mode.id }));
      list.appendChild(b);
    }
  }

  function renderPlayers(room) {
    const list = $('playerList');
    list.innerHTML = '';
    for (const p of room.players) {
      const row = document.createElement('div');
      row.className = `player-row${p.ready ? ' ready' : ''}`;
      row.innerHTML = `
        <span class="dot"></span>
        <span class="nm">${escape(p.name)}</span>
        <span class="lvl">L${p.level || 1}</span>
        <span class="tags">
          ${p.isHost ? '<span class="badge host">HOST</span>' : ''}
          ${p.bot ? '<span class="badge bot">BOT</span>' : ''}
          ${p.id === room.you ? '<span class="badge you">YOU</span>' : ''}
        </span>`;
      list.appendChild(row);
    }
  }

  $('copyCode').addEventListener('click', () => copy($('lobbyCode').textContent, 'Room code copied.'));
  $('copyLink').addEventListener('click', () => {
    copy(`${location.origin}/?join=${$('lobbyCode').textContent}`, 'Invite link copied. Send it to anyone.');
  });
  function copy(text, msg) {
    navigator.clipboard?.writeText(text).then(() => toast(msg, 'good'))
      .catch(() => {
        // Clipboard is blocked on insecure origins; show it so it can be copied by hand.
        toast(text, 'info', 12000);
      });
  }

  $('readyBtn').addEventListener('click', () => cbs.onReady?.());
  $('startBtn').addEventListener('click', () => cbs.onStart?.());
  $('leaveBtn').addEventListener('click', () => cbs.onLeave?.());
  $('lobbyInviteGo').addEventListener('click', () => {
    const u = $('lobbyInviteUser').value.trim();
    if (u) cbs.onInvite?.(u);
  });
  for (const [id, key] of [['optBots', 'bots'], ['optRounds', 'rounds'], ['optDifficulty', 'difficulty']]) {
    $(id).addEventListener('change', () => cbs.onSetOption?.({ [key]: Number($(id).value) }));
  }
  $('optPrivate').addEventListener('change', () => cbs.onSetOption?.({ isPrivate: $('optPrivate').checked }));

  $('lobbyChatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('lobbyChatInput').value.trim();
    $('lobbyChatInput').value = '';
    if (text) cbs.onChat?.(text);
  });

  function lobbyChat(entry) {
    const log = $('lobbyChatLog');
    const row = document.createElement('div');
    if (entry.sys) row.innerHTML = `<span class="sys">${escape(entry.text)}</span>`;
    else row.innerHTML = `<span class="who">${escape(entry.from)}</span> ${escape(entry.text)}`;
    log.appendChild(row);
    while (log.children.length > 60) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  function roomList(rooms) {
    const list = $('roomList');
    if (!rooms.length) {
      list.innerHTML = '<p class="muted">No public rooms right now. Create one and send the link.</p>';
      return;
    }
    list.innerHTML = '';
    for (const r of rooms) {
      const row = document.createElement('div');
      row.className = 'room-row';
      const mode = MODES[r.modeId];
      row.innerHTML = `
        <b>${escape(r.code)}</b>
        <div class="grow">
          <div>${escape(r.name)}</div>
          <small class="muted">${escape(r.mapId)} · ${escape(mode?.name || r.modeId)} ·
            ${r.phase === Phase.LOBBY ? 'in lobby' : `round ${r.round}`}</small>
        </div>
        <span class="muted">${r.players}+${r.bots}/${r.max}</span>`;
      const b = document.createElement('button');
      b.className = 'primary';
      b.textContent = 'Join';
      b.addEventListener('click', () => cbs.onJoin?.(r.code));
      row.appendChild(b);
      list.appendChild(row);
    }
  }

  // ------------------------------------------------------------- settings --
  const settingBinds = [
    ['setSens', 'sensitivity', (v) => v / 100, (v) => v.toFixed(2), 'setSensOut'],
    ['setFov', 'fov', (v) => v, (v) => `${v}`, 'setFovOut'],
    ['setScale', 'renderScale', (v) => v / 100, (v) => `${v}%`, 'setScaleOut'],
  ];
  for (const [id, key, parse, fmt, outId] of settingBinds) {
    const input = $(id);
    input.addEventListener('input', () => {
      const raw = Number(input.value);
      const val = parse(raw);
      if (outId) $(outId).textContent = fmt(raw);
      cbs.onSetting?.({ [key]: val });
    });
  }
  $('setInvert').addEventListener('change', () => cbs.onSetting?.({ invertY: $('setInvert').checked }));
  $('setToggleCrouch').addEventListener('change', () => cbs.onSetting?.({ toggleCrouch: $('setToggleCrouch').checked }));
  $('setShowFps').addEventListener('change', () => cbs.onSetting?.({ showFps: $('setShowFps').checked }));
  for (const [id, key] of [['setMaster', 'master'], ['setSfx', 'sfx'], ['setMusic', 'music']]) {
    $(id).addEventListener('input', () => cbs.onSetting?.({ [key]: Number($(id).value) / 100 }));
  }
  $('resetBinds').addEventListener('click', () => { cbs.onResetBinds?.(); renderBinds(); });

  let listening = null;
  function renderBinds() {
    const list = $('bindList');
    list.innerHTML = '';
    for (const action of Object.keys(DEFAULT_BINDS)) {
      const row = document.createElement('div');
      row.className = 'bind-row';
      const label = document.createElement('span');
      label.textContent = action.replace(/([A-Z])/g, ' $1');
      const btn = document.createElement('button');
      btn.textContent = keyLabel(game.input.binds[action]);
      btn.addEventListener('click', () => {
        if (listening) listening.btn.classList.remove('listening');
        listening = { action, btn };
        btn.classList.add('listening');
        btn.textContent = 'press a key…';
      });
      row.append(label, btn);
      list.appendChild(row);
    }
  }

  window.addEventListener('keydown', (e) => {
    if (!listening) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code !== 'Escape') cbs.onRebind?.(listening.action, e.code);
    listening.btn.classList.remove('listening');
    listening = null;
    renderBinds();
  }, true);

  function syncSettings(settings, audioLevels) {
    $('setSens').value = Math.round(settings.sensitivity * 100);
    $('setSensOut').textContent = settings.sensitivity.toFixed(2);
    $('setFov').value = settings.fov;
    $('setFovOut').textContent = String(settings.fov);
    $('setInvert').checked = !!settings.invertY;
    $('setToggleCrouch').checked = !!settings.toggleCrouch;
    $('setScale').value = Math.round((settings.renderScale ?? 1) * 100);
    $('setScaleOut').textContent = `${Math.round((settings.renderScale ?? 1) * 100)}%`;
    $('setShowFps').checked = !!settings.showFps;
    if (audioLevels) {
      $('setMaster').value = Math.round(audioLevels.master * 100);
      $('setSfx').value = Math.round(audioLevels.sfx * 100);
      $('setMusic').value = Math.round(audioLevels.music * 100);
    }
  }

  // -------------------------------------------------------------- profile --
  function renderProfile(account) {
    const body = $('profileBody');
    if (!account) {
      body.innerHTML = '<p class="muted">Pick a username on the main menu to keep stats and get invites.</p>';
      return;
    }
    const pct = account.need ? Math.round((account.into / account.need) * 100) : 0;
    body.innerHTML = `
      <div class="stat-tile" style="grid-column:1/-1">
        <div class="k">Level</div><div class="n">${account.level}</div>
        <div class="xp-bar"><div style="width:${pct}%"></div></div>
        <small class="muted">${Math.round(account.into || 0)} / ${account.need || 0} XP to level ${account.level + 1}</small>
      </div>
      ${tile('Matches', account.matches || 0)}
      ${tile('Tags', account.tags || 0)}
      ${tile('Time survived', `${Math.round((account.survived || 0) / 60)}m`)}
      ${tile('Guns unlocked', (account.unlocked || []).length)}
      <div class="stat-tile" style="grid-column:1/-1">
        <div class="k">Friends</div>
        <div>${(account.friends || []).length
          ? account.friends.map((f) => `<span class="badge">${escape(f)}</span>`).join(' ')
          : '<span class="muted">Invite someone by username to add them.</span>'}</div>
      </div>`;
  }
  const tile = (k, n) => `<div class="stat-tile"><div class="k">${k}</div><div class="n">${n}</div></div>`;

  function renderHelpBinds() {
    $('helpBinds').innerHTML = Object.entries(game.input.binds)
      .map(([action, code]) => `<div><span>${action.replace(/([A-Z])/g, ' $1')}</span><b>${keyLabel(code)}</b></div>`)
      .join('');
  }

  // -------------------------------------------------------------- results --
  function renderResults(data) {
    if (!data) return;
    $('resultTitle').textContent = data.title || 'Round over';
    $('resultSub').textContent = data.subtitle || '';
    $('resultBody').innerHTML = (data.rows || []).map((r, i) => `
      <tr class="${r.id === data.youId ? 'me' : ''}">
        <td>${i + 1}</td>
        <td>${escape(r.name)}${r.bot ? ' <span class="badge bot">BOT</span>' : ''}</td>
        <td>${r.score}</td><td>${r.tags}</td><td>${r.survived}s</td>
        <td>${Math.round((r.blend || 0) * 100)}%</td>
      </tr>`).join('');
  }
  $('resultContinue').addEventListener('click', () => cbs.onResultsContinue?.());

  // --------------------------------------------------------------- invite --
  let pendingInvite = null;
  function invite(payload) {
    pendingInvite = payload;
    $('inviteText').textContent = `${payload.from} invited you to room ${payload.code}`;
    $('invitePopup').classList.remove('hidden');
  }
  $('inviteAccept').addEventListener('click', () => {
    $('invitePopup').classList.add('hidden');
    if (pendingInvite) cbs.onAcceptInvite?.(pendingInvite.code);
  });
  $('inviteDecline').addEventListener('click', () => $('invitePopup').classList.add('hidden'));

  function setIdentity(name, username) {
    $('nameInput').value = name || '';
    $('usernameInput').value = username || '';
  }

  return {
    bind, show, toast, bootStatus, netStatus, roomState, roomList, lobbyChat,
    invite, syncSettings, renderBinds, setIdentity, renderProfile,
    get screen() { return current; },
    get room() { return lastRoom; },
  };
}
