// Input: pointer lock, keyboard state, mouse buttons, hotbar selection.
// Key handling is by physical `code`, so it works on non-QWERTY layouts.

import { CONFIG } from '../core/config.js';

export class Controls {
  constructor(game, canvas) {
    this.game = game;
    this.canvas = canvas;
    this.keys = new Set();
    this.locked = false;
    this.state = {
      forward: false, back: false, left: false, right: false,
      jump: false, sneak: false, sprint: false, attack: false, use: false,
    };
    this.lastW = 0;
    this.sprintLatch = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this._bind();
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('click', () => {
      if (this.game.started && !this.game.ui.isOpen && !this.locked) this.requestLock();
    });
    document.addEventListener('pointerlockchange', () => {
      const wasLocked = this.locked;
      this.locked = document.pointerLockElement === c;
      if (this.locked) { this.everLocked = true; return; }
      this.state.attack = false;
      this.state.use = false;
      this.keys.clear();
      this._syncState();
      // Only treat this as "the player let go" if we were genuinely locked.
      // A lock request that never took (no user gesture, or the browser
      // refused) must not bounce the player into the pause menu.
      if (wasLocked && this.game.started && !this.game.ui.isOpen && !this.game.player.dead) {
        this.game.ui.openPause();
      }
    });
    document.addEventListener('pointerlockerror', () => { this.locked = false; });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const s = CONFIG.mouseSensitivity;
      this.game.player.yaw += e.movementX * s;
      this.game.player.pitch -= e.movementY * s * (CONFIG.invertY ? -1 : 1);
      const lim = Math.PI / 2 - 0.001;
      if (this.game.player.pitch > lim) this.game.player.pitch = lim;
      if (this.game.player.pitch < -lim) this.game.player.pitch = -lim;
    });

    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.state.attack = true; this.game.onAttackPressed(); }
      if (e.button === 2) { this.state.use = true; this.game.onUsePressed(); }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.state.attack = false;
      if (e.button === 2) { this.state.use = false; this.game.onUseReleased(); }
    });
    document.addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });

    document.addEventListener('wheel', (e) => {
      if (!this.locked || this.game.ui.isOpen) return;
      const inv = this.game.player.inventory;
      inv.selected = (inv.selected + (e.deltaY > 0 ? 1 : -1) + 9) % 9;
    }, { passive: true });

    window.addEventListener('keydown', (e) => this._onKey(e, true));
    window.addEventListener('keyup', (e) => this._onKey(e, false));
    window.addEventListener('blur', () => { this.keys.clear(); this._syncState(); });
  }

  requestLock() {
    const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
    if (p && p.catch) p.catch(() => this.canvas.requestPointerLock());
  }

  _onKey(e, down) {
    const code = e.code;
    // let the browser handle typing in text fields
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    if (this.game.ui && this.game.ui.chatOpen) return;

    if (down) {
      if (this.keys.has(code)) { this._syncState(); return; }
      this.keys.add(code);
      this._handlePress(code, e);
    } else {
      this.keys.delete(code);
      if (code === 'KeyW') this.sprintLatch = false;
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ControlLeft', 'F3', 'Tab'].includes(code)) {
      e.preventDefault();
    }
    this._syncState();
  }

  _handlePress(code, e) {
    const game = this.game;
    if (code === 'Escape') {
      if (game.ui.isOpen) {
        if (game.ui.screen === 'death') return;
        game.ui.close();
        if (game.started) this.requestLock();
      } else if (game.started) {
        document.exitPointerLock();
        game.ui.openPause();
      }
      return;
    }
    if (!game.started) return;

    if (code === 'KeyE') {
      if (game.ui.isOpen) {
        if (['inventory', 'crafting', 'chest', 'furnace'].includes(game.ui.screen)) {
          game.ui.close(); this.requestLock();
        }
      } else if (!game.player.dead) {
        document.exitPointerLock();
        game.ui.openInventory();
      }
      return;
    }
    if (game.ui.isOpen) return;

    if (code === 'F3') { game.toggleDebug(); return; }
    if (code === 'KeyT' && game.net) { game.ui.openChat(); return; }
    if (code === 'KeyQ') { game.dropHeld(e.shiftKey); return; }
    if (code.startsWith('Digit')) {
      const n = +code.slice(5);
      if (n >= 1 && n <= 9) game.player.inventory.selected = n - 1;
      return;
    }
    if (code === 'KeyW' && CONFIG.doubleTapSprint) {
      const now = performance.now();
      if (now - this.lastW < 280) this.sprintLatch = true;
      this.lastW = now;
    }
    if (code === 'KeyB' && game.player.sleeping) game.player.wake();
  }

  _syncState() {
    const k = this.keys;
    const s = this.state;
    s.forward = k.has('KeyW');
    s.back = k.has('KeyS');
    s.left = k.has('KeyA');
    s.right = k.has('KeyD');
    s.jump = k.has('Space');
    s.sneak = k.has('ShiftLeft') || k.has('ShiftRight');
    s.sprint = k.has('ControlLeft') || k.has('ControlRight') || this.sprintLatch;
    if (this.game.ui.isOpen) {
      s.forward = s.back = s.left = s.right = s.jump = false;
      s.attack = false;
    }
  }
}
