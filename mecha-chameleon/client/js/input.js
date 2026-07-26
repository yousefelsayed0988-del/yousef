// Keyboard, mouse, pointer lock, gamepad and touch, folded into one input
// record per frame. Key bindings are remappable and persist in localStorage.

import { BTN } from '../../shared/movement.js';
import { clamp } from '../../shared/math.js';

export const DEFAULT_BINDS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', sprint: 'ShiftLeft', crouch: 'ControlLeft', prone: 'KeyZ',
  use: 'KeyE', reload: 'KeyR', paint: 'KeyQ', pose: 'KeyF', emote: 'KeyG',
  scan: 'KeyX', ability: 'KeyC', scoreboard: 'Tab', chat: 'Enter', map: 'KeyM',
  camera: 'KeyV', pick: 'KeyT',
};

const STORAGE_KEY = 'mc.binds.v1';
const SETTINGS_KEY = 'mc.settings.v1';

export function createInput(canvas, opts = {}) {
  const binds = { ...DEFAULT_BINDS, ...readJson(STORAGE_KEY) };
  const settings = {
    sensitivity: 1.0,
    invertY: false,
    fov: 78,
    toggleCrouch: false,
    ...readJson(SETTINGS_KEY),
  };

  const down = new Set();
  const pressed = new Set();   // edge-triggered, cleared each frame
  const listeners = new Map();
  let yaw = 0, pitch = 0;
  let locked = false;
  let crouchToggled = false;
  let enabled = true;
  const touch = { active: false, mx: 0, mz: 0, look: { x: 0, y: 0 }, fire: false, jump: false };

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
  }
  function saveBinds() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(binds)); } catch { /* private mode */ } }
  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode */ } }

  function on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event)?.delete(fn);
  }
  function fire(event, payload) {
    const set = listeners.get(event);
    if (set) for (const fn of set) fn(payload);
  }

  // ------------------------------------------------------------- keyboard --
  const onKeyDown = (e) => {
    if (!enabled) return;
    const typing = document.activeElement &&
      /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (typing) {
      if (e.code === 'Escape') document.activeElement.blur();
      return;
    }
    if (e.code === binds.scoreboard) e.preventDefault();
    if (down.has(e.code)) return;
    down.add(e.code);
    pressed.add(e.code);
    if (e.code === binds.crouch && settings.toggleCrouch) crouchToggled = !crouchToggled;
    fire('key', { code: e.code, action: actionFor(e.code) });
  };
  const onKeyUp = (e) => {
    down.delete(e.code);
    fire('keyup', { code: e.code, action: actionFor(e.code) });
  };
  function actionFor(code) {
    for (const [action, bound] of Object.entries(binds)) if (bound === code) return action;
    return null;
  }

  // ---------------------------------------------------------------- mouse --
  const onMouseMove = (e) => {
    if (!locked || !enabled) return;
    const s = settings.sensitivity * 0.0022;
    yaw -= e.movementX * s;
    pitch += (settings.invertY ? e.movementY : -e.movementY) * s;
    pitch = clamp(pitch, -1.5, 1.5);
    if (yaw > Math.PI) yaw -= Math.PI * 2;
    if (yaw < -Math.PI) yaw += Math.PI * 2;
  };
  const onMouseDown = (e) => {
    if (!enabled) return;
    if (!locked && e.target === canvas) { requestLock(); return; }
    if (e.button === 0) { down.add('Mouse0'); pressed.add('Mouse0'); fire('fire', {}); }
    if (e.button === 2) { down.add('Mouse2'); pressed.add('Mouse2'); fire('aim', { on: true }); }
  };
  const onMouseUp = (e) => {
    if (e.button === 0) down.delete('Mouse0');
    if (e.button === 2) { down.delete('Mouse2'); fire('aim', { on: false }); }
  };
  const onWheel = (e) => { if (locked) fire('wheel', { dy: Math.sign(e.deltaY) }); };
  const onContext = (e) => { if (locked) e.preventDefault(); };
  const onLockChange = () => {
    locked = document.pointerLockElement === canvas;
    fire('lock', { locked });
  };

  function requestLock() {
    if (document.pointerLockElement === canvas) return;
    canvas.requestPointerLock?.();
  }
  function releaseLock() {
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
  }

  // ---------------------------------------------------------------- touch --
  function attachTouch(root) {
    if (!('ontouchstart' in window)) return;
    touch.active = true;
    root.classList.add('touch');
    const stick = root.querySelector('#touchStick');
    const knob = root.querySelector('#touchKnob');
    const look = root.querySelector('#touchLook');
    if (!stick || !look) return;

    let stickId = null, origin = { x: 0, y: 0 };
    stick.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      stickId = t.identifier;
      origin = { x: t.clientX, y: t.clientY };
      e.preventDefault();
    }, { passive: false });
    const moveStick = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        const dx = clamp((t.clientX - origin.x) / 48, -1, 1);
        const dy = clamp((t.clientY - origin.y) / 48, -1, 1);
        touch.mx = dx; touch.mz = dy;
        if (knob) knob.style.transform = `translate(${dx * 30}px, ${dy * 30}px)`;
      }
      e.preventDefault();
    };
    stick.addEventListener('touchmove', moveStick, { passive: false });
    const endStick = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        stickId = null; touch.mx = 0; touch.mz = 0;
        if (knob) knob.style.transform = '';
      }
    };
    stick.addEventListener('touchend', endStick);
    stick.addEventListener('touchcancel', endStick);

    let lookId = null, lookPrev = { x: 0, y: 0 };
    look.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      lookId = t.identifier;
      lookPrev = { x: t.clientX, y: t.clientY };
      e.preventDefault();
    }, { passive: false });
    look.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        const s = settings.sensitivity * 0.005;
        yaw -= (t.clientX - lookPrev.x) * s;
        pitch += (settings.invertY ? (t.clientY - lookPrev.y) : -(t.clientY - lookPrev.y)) * s;
        pitch = clamp(pitch, -1.5, 1.5);
        lookPrev = { x: t.clientX, y: t.clientY };
      }
      e.preventDefault();
    }, { passive: false });
    look.addEventListener('touchend', () => { lookId = null; });
  }

  // -------------------------------------------------------------- gamepad --
  function pollGamepad() {
    const pads = navigator.getGamepads?.() || [];
    for (const pad of pads) {
      if (!pad) continue;
      const dead = (v) => (Math.abs(v) < 0.18 ? 0 : v);
      touch.mx = dead(pad.axes[0] || 0);
      touch.mz = dead(pad.axes[1] || 0);
      const s = settings.sensitivity * 0.045;
      yaw -= dead(pad.axes[2] || 0) * s;
      pitch += (settings.invertY ? 1 : -1) * dead(pad.axes[3] || 0) * s;
      pitch = clamp(pitch, -1.5, 1.5);
      if (pad.buttons[7]?.pressed) { if (!down.has('PadFire')) { pressed.add('PadFire'); fire('fire', {}); } down.add('PadFire'); }
      else down.delete('PadFire');
      if (pad.buttons[0]?.pressed) down.add(binds.jump); else if (!down.has('Space')) down.delete(binds.jump);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- frame --
  /** Build one input record for the simulation. */
  function sample(dt) {
    if (!touch.active) pollGamepad();
    let mx = 0, mz = 0;
    if (down.has(binds.forward)) mz -= 1;
    if (down.has(binds.back)) mz += 1;
    if (down.has(binds.left)) mx -= 1;
    if (down.has(binds.right)) mx += 1;
    mx += touch.mx;
    mz += touch.mz;
    const mag = Math.hypot(mx, mz);
    if (mag > 1) { mx /= mag; mz /= mag; }

    let buttons = 0;
    if (down.has(binds.jump)) buttons |= BTN.JUMP;
    if (down.has(binds.sprint)) buttons |= BTN.SPRINT;
    if (settings.toggleCrouch ? crouchToggled : down.has(binds.crouch)) buttons |= BTN.CROUCH;
    if (down.has(binds.prone)) buttons |= BTN.PRONE;
    if (down.has(binds.use)) buttons |= BTN.USE;

    return { mx, mz, yaw, pitch, buttons, dt };
  }

  function endFrame() { pressed.clear(); }

  const api = {
    binds, settings, on,
    get locked() { return locked; },
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    setAngles(y, p) { yaw = y; pitch = clamp(p, -1.5, 1.5); },
    isDown: (action) => down.has(binds[action] || action),
    wasPressed: (action) => pressed.has(binds[action] || action),
    firing: () => down.has('Mouse0') || down.has('PadFire') || touch.fire,
    aiming: () => down.has('Mouse2'),
    sample, endFrame, requestLock, releaseLock, attachTouch,
    setEnabled(v) { enabled = v; if (!v) down.clear(); },
    rebind(action, code) { binds[action] = code; saveBinds(); },
    resetBinds() { Object.assign(binds, DEFAULT_BINDS); saveBinds(); },
    updateSettings(patch) { Object.assign(settings, patch); saveSettings(); },
    setTouchFire(v) { touch.fire = v; },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('wheel', onWheel);
      document.removeEventListener('pointerlockchange', onLockChange);
    },
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('contextmenu', onContext);
  window.addEventListener('blur', () => down.clear());
  document.addEventListener('pointerlockchange', onLockChange);

  return api;
}
