// All DOM UI: HUD, debug overlay, and the container/crafting/menu screens.
//
// The UI is plain DOM over the WebGL canvas rather than drawn in GL. It keeps
// text crisp at any DPI, makes drag-and-drop and accessibility straightforward,
// and costs nothing on the render thread as long as it only touches the DOM
// when something actually changed.

import { CONFIG, DIFFICULTIES, saveSettings } from '../core/config.js';
import { BLOCKS } from '../core/blocks.js';
import { ITEMS, item, itemByName, maxDurability } from '../core/items.js';
import { itemIconURL } from '../render/textures.js';
import { Container, CraftingGrid, mkStack, sameItem, copyStack, ARMOR_START, OFFHAND, HOTBAR, MAIN } from '../items/inventory.js';
import { fuelTicks, smeltResult } from '../core/recipes.js';

const el = (tag, cls, parent) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
};

export class GameUI {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.atlas = game.atlas;
    this.screen = null;
    this.cursorStack = null;
    this.toasts = [];
    this.slotViews = [];
    this._build();
  }

  /**
   * HUD meter icons (hearts, drumsticks, armour, bubbles) are generated as
   * inline SVG data URIs and exposed as CSS custom properties -- procedural,
   * crisp at any DPI, and no image files.
   */
  _installIcons() {
    const svg = (body) => `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12">${body}</svg>`)}")`;

    const HEART = 'M6 11.2C2.2 8.3 0.2 6.2 0.2 3.8 0.2 1.8 1.6 0.4 3.3 0.4 4.4 0.4 5.4 1 6 2 6.6 1 7.6 0.4 8.7 0.4c1.7 0 3.1 1.4 3.1 3.4 0 2.4-2 4.5-5.8 7.4z';
    const FOOD = 'M2.2 9.6c-.7-.7-.5-1.6.2-2.3l3.2-3.2c.9-.9 2-1.3 2.9-.9.5-.9 1.6-1.2 2.3-.5.7.7.4 1.8-.5 2.3.4.9 0 2-.9 2.9L5.2 11c-.7.7-1.6.9-2.3.2-.3-.3-.4-.7-.3-1.1-.4.1-.8 0-1.1-.3z';
    const ARMOR = 'M6 .5 11 2.3v3.4C11 8.5 8.9 10.7 6 11.5 3.1 10.7 1 8.5 1 5.7V2.3z';
    const BUBBLE = 'M6 1.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6z';

    const icon = (path, fill, stroke) =>
      svg(`<path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width=".7" stroke-linejoin="round"/>`);
    const half = (path, fill, empty, stroke) => svg(
      `<defs><clipPath id="h"><rect x="0" y="0" width="6" height="12"/></clipPath></defs>` +
      `<path d="${path}" fill="${empty}" stroke="${stroke}" stroke-width=".7" stroke-linejoin="round"/>` +
      // encodeURIComponent turns the '#' into %23 for us; writing %23 here
      // would get double-escaped into %2523 and silently break the clip
      `<path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width=".7" stroke-linejoin="round" clip-path="url(#h)"/>`);

    const s = document.createElement('style');
    const dark = '#1b1d22', edge = '#0a0b0e';
    s.textContent = `:root{
      --heart-full:${icon(HEART, '#d9382e', edge)};
      --heart-half:${half(HEART, '#d9382e', dark, edge)};
      --heart-empty:${icon(HEART, dark, edge)};
      --food-full:${icon(FOOD, '#c9843a', edge)};
      --food-half:${half(FOOD, '#c9843a', dark, edge)};
      --food-empty:${icon(FOOD, dark, edge)};
      --armor-full:${icon(ARMOR, '#c6ccd8', edge)};
      --armor-half:${half(ARMOR, '#c6ccd8', dark, edge)};
      --armor-empty:${icon(ARMOR, dark, edge)};
      --bubble-full:${icon(BUBBLE, '#9fd4f5', edge)};
    }`;
    document.head.appendChild(s);
  }

  // ---------------------------------------------------------------- build
  _build() {
    this._installIcons();
    const r = this.root;
    this.hud = el('div', 'hud', r);
    this.crosshair = el('div', 'crosshair', this.hud);

    this.statusWrap = el('div', 'status', this.hud);
    this.healthRow = el('div', 'meter health', this.statusWrap);
    this.armorRow = el('div', 'meter armor', this.statusWrap);
    this.rightWrap = el('div', 'status right', this.hud);
    this.foodRow = el('div', 'meter food', this.rightWrap);
    this.airRow = el('div', 'meter air', this.rightWrap);

    this.hotbar = el('div', 'hotbar', this.hud);
    this.hotbarSlots = [];
    for (let i = 0; i < 9; i++) {
      const s = el('div', 'slot hotbar-slot', this.hotbar);
      s.dataset.index = i;
      this.hotbarSlots.push(this._makeSlot(s));
    }
    this.itemName = el('div', 'item-name', this.hud);

    this.heldView = el('div', 'held-item', this.hud);

    this.toastBox = el('div', 'toasts', r);
    this.debug = el('div', 'debug', r);
    this.debug.style.display = 'none';

    this.overlay = el('div', 'overlay', r);
    this.overlay.style.display = 'none';
    this.panel = el('div', 'panel', this.overlay);

    this.cursorEl = el('div', 'cursor-stack', r);
    this.cursorEl.style.display = 'none';

    this.vignette = el('div', 'vignette', r);
    this.damageFlash = el('div', 'damage-flash', r);
    this.fluidOverlay = el('div', 'fluid-overlay', r);

    document.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX; this.mouseY = e.clientY;
      if (this.cursorStack) {
        this.cursorEl.style.left = e.clientX + 'px';
        this.cursorEl.style.top = e.clientY + 'px';
      }
    });
    this.overlay.addEventListener('contextmenu', e => e.preventDefault());
  }

  _makeSlot(node) {
    const icon = el('div', 'slot-icon', node);
    const count = el('div', 'slot-count', node);
    const dura = el('div', 'slot-dura', node);
    const bar = el('i', null, dura);
    return { node, icon, count, dura, bar, stack: undefined, dmg: undefined };
  }

  _renderSlot(view, stack) {
    const key = stack ? stack.id + ':' + stack.count + ':' + (stack.dmg || 0) : '';
    if (view._key === key) return;
    view._key = key;
    if (!stack) {
      view.icon.style.backgroundImage = '';
      view.count.textContent = '';
      view.dura.style.display = 'none';
      return;
    }
    const it = item(stack.id);
    if (!it) { view.icon.style.backgroundImage = ''; view.count.textContent = '?'; return; }
    view.icon.style.backgroundImage = `url(${itemIconURL(it, this.atlas)})`;
    view.count.textContent = stack.count > 1 ? stack.count : '';
    const max = maxDurability(stack.id);
    if (max && stack.dmg > 0) {
      const f = 1 - stack.dmg / max;
      view.dura.style.display = '';
      view.bar.style.width = (f * 100) + '%';
      view.bar.style.background = f > 0.5 ? '#4ad14a' : f > 0.25 ? '#e0c020' : '#e04040';
    } else view.dura.style.display = 'none';
  }

  // ------------------------------------------------------------------ HUD
  updateHUD() {
    const p = this.game.player;
    const inv = p.inventory;

    for (let i = 0; i < 9; i++) {
      this._renderSlot(this.hotbarSlots[i], inv.get(i));
      this.hotbarSlots[i].node.classList.toggle('selected', i === inv.selected);
    }

    this._meter(this.healthRow, 10, p.health / 2, 'heart', p.hurtFlash > 0);
    this._meter(this.foodRow, 10, p.hunger / 2, 'drumstick', false);
    const armor = inv.totalArmor().defense;
    this._meter(this.armorRow, 10, armor / 2, 'shield', false);
    this.armorRow.style.display = armor > 0 ? '' : 'none';
    const airPct = p.air / p.maxAir;
    this._meter(this.airRow, 10, p.submerged ? airPct * 10 : 0, 'bubble', false);
    this.airRow.style.display = (p.submerged && airPct < 1) ? '' : 'none';

    // held item name flash
    if (this._lastSel !== inv.selected || this._lastHeldId !== (inv.held && inv.held.id)) {
      this._lastSel = inv.selected;
      this._lastHeldId = inv.held && inv.held.id;
      const it = inv.held ? item(inv.held.id) : null;
      this.itemName.textContent = it ? it.display : '';
      this.itemName.classList.remove('show');
      void this.itemName.offsetWidth;
      if (it) this.itemName.classList.add('show');
    }

    // first-person held item corner view
    const held = inv.held;
    const hk = held ? held.id : 0;
    if (this._heldKey !== hk) {
      this._heldKey = hk;
      this.heldView.style.backgroundImage = held ? `url(${itemIconURL(item(held.id), this.atlas)})` : '';
    }
    const swing = this.game.player.swingTime;
    const bob = Math.sin(this.game.player.bobPhase) * (CONFIG.viewBobbing ? 6 : 0);
    const sw = swing > 0 ? Math.sin((6 - swing) / 6 * Math.PI) * 40 : 0;
    this.heldView.style.transform = `translate(${bob - sw * 0.5}px, ${-Math.abs(bob) * 0.6 + sw}px) rotate(${-sw * 0.6}deg)`;

    this.damageFlash.style.opacity = p.hurtFlash > 0 ? (p.hurtFlash / 8) * 0.45 : 0;
    const lowHealth = p.health <= 6 && p.health > 0;
    this.vignette.classList.toggle('low', lowHealth);
  }

  _meter(row, count, value, kind, flash) {
    if (row._kind !== kind || row.childElementCount !== count) {
      row.textContent = '';
      row._kind = kind;
      for (let i = 0; i < count; i++) el('i', kind, row);
    }
    const kids = row.children;
    for (let i = 0; i < count; i++) {
      const v = value - i;
      const cls = v >= 1 ? 'full' : v >= 0.5 ? 'half' : 'empty';
      if (kids[i]._state !== cls) { kids[i]._state = cls; kids[i].className = kind + ' ' + cls; }
    }
    row.classList.toggle('flash', !!flash);
  }

  toast(msg, ms = 2600) {
    const t = el('div', 'toast', this.toastBox);
    t.textContent = msg;
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
  }

  setDebug(visible) { this.debug.style.display = visible ? '' : 'none'; }

  updateDebug(info) {
    if (this.debug.style.display === 'none') return;
    this.debug.textContent = info;
  }

  // -------------------------------------------------------------- screens
  get isOpen() { return this.screen !== null; }

  open(name, builder, opts = {}) {
    this.screen = name;
    this.panel.textContent = '';
    this.slotViews = [];
    this.panel.className = 'panel ' + (opts.panelClass || '');
    this.overlay.style.display = '';
    this.overlay.classList.toggle('menu', !!opts.menu);
    builder(this.panel);
    this.game.onUIOpen();
  }

  close() {
    if (!this.screen) return;
    // return anything held on the cursor to the inventory
    if (this.cursorStack) {
      const left = this.game.player.inventory.pickUp(this.cursorStack);
      if (left) this.game.dropItemFromPlayer(left);
      this.cursorStack = null;
      this._updateCursor();
    }
    if (this.craftGrid) {
      this.craftGrid.clearTo(this.game.player.inventory, s => this.game.dropItemFromPlayer(s));
      this.craftGrid = null;
    }
    this.screen = null;
    this.overlay.style.display = 'none';
    this.panel.textContent = '';
    this.slotViews = [];
    this.onRefresh = null;
    this.game.onUIClose();
  }

  refresh() {
    for (const sv of this.slotViews) {
      this._renderSlot(sv, sv.get());
    }
    if (this.onRefresh) this.onRefresh();
  }

  _slotGrid(parent, cols, entries, cls = '') {
    const grid = el('div', 'grid ' + cls, parent);
    grid.style.gridTemplateColumns = `repeat(${cols}, var(--slot))`;
    for (const entry of entries) {
      const node = el('div', 'slot', grid);
      const view = this._makeSlot(node);
      view.get = entry.get;
      view.set = entry.set;
      view.onClick = entry.onClick;
      view.readOnly = entry.readOnly;
      view.filter = entry.filter;
      this.slotViews.push(view);
      node.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        this._slotClick(view, ev);
      });
      node.addEventListener('mouseenter', () => {
        const s = view.get();
        node.title = s ? item(s.id).display + (s.count > 1 ? ' x' + s.count : '') : '';
      });
      this._renderSlot(view, entry.get());
    }
    return grid;
  }

  _slotClick(view, ev) {
    const right = ev.button === 2;
    const shift = ev.shiftKey;
    const cur = this.cursorStack;
    const slot = view.get();

    if (view.onClick) { view.onClick(ev, this); this.refresh(); return; }

    if (shift) {
      if (view.quickMove) view.quickMove();
      this.refresh();
      return;
    }
    if (view.readOnly) {
      // output slots: take the result, never place into them
      if (!slot) return;
      if (cur && !sameItem(cur, slot)) return;
      if (view.take) view.take();
      this.refresh();
      return;
    }
    if (!cur) {
      if (!slot) return;
      if (right) {
        const half = Math.ceil(slot.count / 2);
        this.cursorStack = mkStack(slot.id, half, slot.dmg);
        slot.count -= half;
        view.set(slot.count > 0 ? slot : null);
      } else {
        this.cursorStack = copyStack(slot);
        view.set(null);
      }
    } else {
      if (view.filter && !view.filter(cur)) { this.refresh(); return; }
      if (!slot) {
        if (right) {
          view.set(mkStack(cur.id, 1, cur.dmg));
          cur.count--;
          if (cur.count <= 0) this.cursorStack = null;
        } else { view.set(cur); this.cursorStack = null; }
      } else if (sameItem(slot, cur)) {
        const limit = item(slot.id).stack;
        const move = right ? Math.min(1, limit - slot.count) : Math.min(cur.count, limit - slot.count);
        slot.count += move; cur.count -= move;
        view.set(slot);
        if (cur.count <= 0) this.cursorStack = null;
      } else if (!right) {
        view.set(cur);
        this.cursorStack = slot;
      }
    }
    this._updateCursor();
    this.refresh();
  }

  _updateCursor() {
    if (!this.cursorStack) { this.cursorEl.style.display = 'none'; return; }
    const it = item(this.cursorStack.id);
    this.cursorEl.style.display = '';
    this.cursorEl.style.backgroundImage = `url(${itemIconURL(it, this.atlas)})`;
    this.cursorEl.dataset.count = this.cursorStack.count > 1 ? this.cursorStack.count : '';
    this.cursorEl.style.left = (this.mouseX || 0) + 'px';
    this.cursorEl.style.top = (this.mouseY || 0) + 'px';
  }

  // ---- shared inventory block (main 27 + hotbar 9)
  _playerSlots(parent, opts = {}) {
    const inv = this.game.player.inventory;
    const mk = (i) => ({
      get: () => inv.get(i),
      set: (s) => inv.set(i, s),
      quickMove: () => opts.quickMove ? opts.quickMove(i) : this._defaultQuickMove(i),
    });
    const main = [];
    for (let i = HOTBAR; i < HOTBAR + MAIN; i++) main.push(mk(i));
    this._slotGrid(parent, 9, main, 'main');
    const hot = [];
    for (let i = 0; i < HOTBAR; i++) hot.push(mk(i));
    this._slotGrid(parent, 9, hot, 'hot');
  }

  _defaultQuickMove(i) {
    const inv = this.game.player.inventory;
    const s = inv.get(i);
    if (!s) return;
    inv.set(i, null);
    const left = i < HOTBAR ? inv.add(s, HOTBAR, HOTBAR + MAIN) : inv.add(s, 0, HOTBAR);
    if (left) inv.set(i, left);
  }

  // ------------------------------------------------------------ inventory
  openInventory() {
    const inv = this.game.player.inventory;
    this.craftGrid = new CraftingGrid(2, 2);
    this.open('inventory', (p) => {
      el('h2', null, p).textContent = 'Inventory';
      const top = el('div', 'row top', p);

      const armorCol = el('div', 'col', top);
      el('div', 'label', armorCol).textContent = 'Armour';
      const armorEntries = [];
      for (let i = 0; i < 4; i++) {
        armorEntries.push({
          get: () => inv.get(ARMOR_START + i),
          set: (s) => inv.set(ARMOR_START + i, s),
          filter: (s) => { const it = item(s.id); return it && it.armor && it.armor.slot === i; },
        });
      }
      this._slotGrid(armorCol, 1, armorEntries, 'armor');

      const offCol = el('div', 'col', top);
      el('div', 'label', offCol).textContent = 'Off-hand';
      this._slotGrid(offCol, 1, [{
        get: () => inv.get(OFFHAND), set: (s) => inv.set(OFFHAND, s),
      }], 'armor');

      const craftCol = el('div', 'col grow', top);
      el('div', 'label', craftCol).textContent = 'Crafting';
      const craftRow = el('div', 'craft-row', craftCol);
      this._craftUI(craftRow, this.craftGrid);

      el('div', 'sep', p);
      this._playerSlots(p);
    });
  }

  openCraftingTable() {
    this.craftGrid = new CraftingGrid(3, 3);
    this.open('crafting', (p) => {
      el('h2', null, p).textContent = 'Crafting Table';
      const craftRow = el('div', 'craft-row', p);
      this._craftUI(craftRow, this.craftGrid);
      el('div', 'sep', p);
      this._playerSlots(p);
    });
  }

  _craftUI(parent, grid) {
    const entries = [];
    for (let i = 0; i < grid.slots.length; i++) {
      entries.push({
        get: () => grid.slots[i],
        set: (s) => { grid.slots[i] = s; grid.update(); },
        quickMove: () => {
          const s = grid.slots[i];
          if (!s) return;
          grid.slots[i] = null;
          const left = this.game.player.inventory.pickUp(s);
          if (left) grid.slots[i] = left;
          grid.update();
        },
      });
    }
    this._slotGrid(parent, grid.w, entries, 'craft');
    el('div', 'arrow', parent).textContent = '→';
    const outWrap = el('div', 'out', parent);
    this._slotGrid(outWrap, 1, [{
      get: () => grid.result,
      set: () => { },
      readOnly: true,
      take: () => this._takeCraft(grid, false),
      quickMove: () => this._takeCraft(grid, true),
    }], 'result');
    grid.update();
  }

  _takeCraft(grid, all) {
    const inv = this.game.player.inventory;
    let made = 0;
    do {
      const res = grid.update();
      if (!res) break;
      if (all) {
        if (!inv.canFit(res)) break;
        const left = inv.pickUp(mkStack(res.id, res.count));
        if (left) { this.game.dropItemFromPlayer(left); }
      } else {
        if (this.cursorStack) {
          if (!sameItem(this.cursorStack, res)) break;
          if (this.cursorStack.count + res.count > item(res.id).stack) break;
          this.cursorStack.count += res.count;
        } else {
          this.cursorStack = mkStack(res.id, res.count);
        }
      }
      const rem = grid.consume();
      for (const r of rem) { const l = inv.pickUp(r); if (l) this.game.dropItemFromPlayer(l); }
      made++;
      this.game.audio.play('craft');
    } while (all && made < 512);
    this._updateCursor();
  }

  // ---------------------------------------------------------------- chest
  openChest(be) {
    const container = new Container(27, 'chest');
    container.slots = be.items;
    this.open('chest', (p) => {
      el('h2', null, p).textContent = 'Chest';
      const entries = [];
      for (let i = 0; i < 27; i++) {
        entries.push({
          get: () => container.slots[i],
          set: (s) => { container.slots[i] = s; },
          quickMove: () => {
            const s = container.slots[i];
            if (!s) return;
            container.slots[i] = null;
            const left = this.game.player.inventory.pickUp(s);
            if (left) container.slots[i] = left;
          },
        });
      }
      this._slotGrid(p, 9, entries, 'chest');
      el('div', 'sep', p);
      this._playerSlots(p, {
        quickMove: (i) => {
          const inv = this.game.player.inventory;
          const s = inv.get(i);
          if (!s) return;
          inv.set(i, null);
          const left = container.add(s);
          if (left) inv.set(i, left);
        },
      });
    });
  }

  // -------------------------------------------------------------- furnace
  openFurnace(be) {
    this.open('furnace', (p) => {
      el('h2', null, p).textContent = 'Furnace';
      const row = el('div', 'furnace-row', p);
      const left = el('div', 'col', row);

      this._slotGrid(left, 1, [{
        get: () => be.input, set: (s) => { be.input = s; },
        quickMove: () => { const s = be.input; if (!s) return; be.input = null; const l = this.game.player.inventory.pickUp(s); if (l) be.input = l; },
      }], 'furnace-in');

      const flame = el('div', 'flame', left);
      this.flameFill = el('i', null, flame);

      this._slotGrid(left, 1, [{
        get: () => be.fuel, set: (s) => { be.fuel = s; },
        filter: (s) => fuelTicks(s.id) > 0,
        quickMove: () => { const s = be.fuel; if (!s) return; be.fuel = null; const l = this.game.player.inventory.pickUp(s); if (l) be.fuel = l; },
      }], 'furnace-fuel');

      const mid = el('div', 'col arrowcol', row);
      const prog = el('div', 'progress', mid);
      this.progFill = el('i', null, prog);

      const right = el('div', 'col', row);
      this._slotGrid(right, 1, [{
        get: () => be.output, set: () => { },
        readOnly: true,
        take: () => {
          if (!be.output) return;
          if (this.cursorStack) {
            if (!sameItem(this.cursorStack, be.output)) return;
            const limit = item(be.output.id).stack;
            const move = Math.min(be.output.count, limit - this.cursorStack.count);
            if (move <= 0) return;
            this.cursorStack.count += move;
            be.output.count -= move;
            if (be.output.count <= 0) be.output = null;
          } else {
            this.cursorStack = copyStack(be.output);
            be.output = null;
          }
          this._updateCursor();
        },
        quickMove: () => {
          if (!be.output) return;
          const l = this.game.player.inventory.pickUp(be.output);
          be.output = l;
        },
      }], 'furnace-out');

      el('div', 'sep', p);
      this._playerSlots(p, {
        quickMove: (i) => {
          const inv = this.game.player.inventory;
          const s = inv.get(i);
          if (!s) return;
          const isFuel = fuelTicks(s.id) > 0;
          const smeltable = !!smeltResult(s.id);
          inv.set(i, null);
          let left = s;
          if (smeltable) left = addToSlot(be, 'input', left);
          if (left && isFuel) left = addToSlot(be, 'fuel', left);
          if (left) inv.set(i, left);
        },
      });

      this.onRefresh = () => {
        const burn = be.burnMax > 0 ? be.burn / be.burnMax : 0;
        this.flameFill.style.height = Math.max(0, Math.min(1, burn)) * 100 + '%';
        const cookTotal = be.cookTotal || 200;
        this.progFill.style.width = Math.max(0, Math.min(1, be.cook / cookTotal)) * 100 + '%';
      };
    });
  }

  // ----------------------------------------------------------------- sign
  openSignEditor(be) {
    if (!be.lines) be.lines = ['', '', '', ''];
    this.open('sign', (p) => {
      el('h2', null, p).textContent = 'Edit Sign';
      const inputs = [];
      for (let i = 0; i < 4; i++) {
        const row = el('div', 'field', p);
        const input = el('input', null, row);
        input.type = 'text';
        input.maxLength = 20;
        input.value = be.lines[i] || '';
        input.placeholder = `line ${i + 1}`;
        input.addEventListener('input', () => { be.lines[i] = input.value; });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); (inputs[i + 1] || inputs[0]).focus(); }
          e.stopPropagation();
        });
        inputs.push(input);
      }
      const menu = el('div', 'menu-buttons', p);
      this._btn(menu, 'Done', () => this.close(), 'primary');
      setTimeout(() => inputs[0].focus(), 30);
    }, { menu: true, panelClass: 'narrow' });
  }

  /** Floating readout when the crosshair is on a written sign. */
  showSignText(lines) {
    if (!this.signBox) {
      this.signBox = el('div', 'sign-readout', this.hud);
    }
    const text = (lines || []).filter(Boolean).join('\n');
    if (this._signText !== text) {
      this._signText = text;
      this.signBox.textContent = text;
    }
    this.signBox.style.display = text ? '' : 'none';
  }

  // ---------------------------------------------------------------- menus
  openPause() {
    this.open('pause', (p) => {
      el('h1', null, p).textContent = 'Paused';
      const menu = el('div', 'menu-buttons', p);
      this._btn(menu, 'Back to Game', () => this.close());
      this._btn(menu, 'Controls & Help', () => this.openHelp());
      this._btn(menu, 'Settings', () => this.openSettings());
      this._btn(menu, 'Save Now', async () => {
        const ok = await this.game.save.save();
        this.toast(ok ? 'World saved.' : 'Save failed.');
      });
      this._btn(menu, 'Save and Quit to Menu', async () => {
        await this.game.save.save();
        this.game.quitToMenu();
      });
      const info = el('div', 'muted center', p);
      info.textContent = `Seed ${this.game.world.seed} • Difficulty ${CONFIG.difficulty}`;
    }, { menu: true, panelClass: 'narrow' });
  }

  openHelp() {
    this.open('help', (p) => {
      el('h1', null, p).textContent = 'Controls';
      const table = el('table', 'controls', p);
      const rows = [
        ['Move', 'W A S D'],
        ['Jump', 'Space'],
        ['Sneak', 'Left Shift'],
        ['Sprint', 'Left Ctrl / double-tap W'],
        ['Look', 'Mouse (click to lock pointer)'],
        ['Mine / attack', 'Left click (hold to break)'],
        ['Place / use', 'Right click'],
        ['Open inventory', 'E'],
        ['Hotbar select', '1 - 9 / scroll wheel'],
        ['Drop item', 'Q'],
        ['Debug overlay', 'F3'],
        ['Pause', 'Esc'],
      ];
      for (const [a, b] of rows) {
        const tr = el('tr', null, table);
        el('td', null, tr).textContent = a;
        el('td', 'key', tr).textContent = b;
      }
      el('h2', null, p).textContent = 'Surviving';
      const tips = el('ul', 'tips', p);
      for (const t of [
        'Punch a tree for logs, then craft planks, sticks, and a crafting table.',
        'Wood tools mine stone and coal; you need stone tools for iron, and iron tools for gold, redstone and diamond.',
        'Torches (coal + stick) keep monsters from spawning: they only appear at light level 7 or below.',
        'Eat before your hunger bar empties -- you only regenerate health while well fed.',
        'A bed skips the night and sets your respawn point, but only if no monsters are close.',
        'Smelt ore in a furnace with coal, charcoal, or planks as fuel.',
        'Water and lava meeting makes stone, cobblestone, or obsidian depending on which is flowing.',
      ]) el('li', null, tips).textContent = t;
      const menu = el('div', 'menu-buttons', p);
      this._btn(menu, 'Back', () => (this.game.started ? this.openPause() : this.openMainMenu()));
    }, { menu: true });
  }

  openSettings() {
    this.open('settings', (p) => {
      el('h1', null, p).textContent = 'Settings';
      const list = el('div', 'settings-list', p);
      this._slider(list, 'Render distance', 4, 16, 1, CONFIG.renderDistance, v => { CONFIG.renderDistance = v; saveSettings(); });
      this._slider(list, 'Simulation distance', 2, 8, 1, CONFIG.simulationDistance, v => { CONFIG.simulationDistance = v; saveSettings(); });
      this._slider(list, 'Field of view', 50, 110, 1, CONFIG.fov, v => { CONFIG.fov = v; saveSettings(); });
      this._slider(list, 'Mouse sensitivity', 5, 60, 1, Math.round(CONFIG.mouseSensitivity * 10000), v => { CONFIG.mouseSensitivity = v / 10000; saveSettings(); });
      this._slider(list, 'Master volume', 0, 100, 1, Math.round(CONFIG.masterVolume * 100), v => { this.game.audio.setVolume(v / 100); saveSettings(); });
      this._slider(list, 'Music volume', 0, 100, 1, Math.round(CONFIG.musicVolume * 100), v => {
        CONFIG.musicVolume = v / 100;
        if (this.game.audio.musicGain) this.game.audio.musicGain.gain.value = CONFIG.musicVolume;
        saveSettings();
      });
      this._slider(list, 'Render scale %', 50, 100, 5, Math.round(CONFIG.renderScale * 100), v => { CONFIG.renderScale = v / 100; this.game.renderer.resize(); saveSettings(); });
      this._toggle(list, 'Smooth lighting', CONFIG.smoothLighting, v => { CONFIG.smoothLighting = v; this.game.remeshAll(); saveSettings(); });
      this._toggle(list, 'View bobbing', CONFIG.viewBobbing, v => { CONFIG.viewBobbing = v; saveSettings(); });
      this._toggle(list, 'Keep inventory on death', CONFIG.keepInventory, v => { CONFIG.keepInventory = v; saveSettings(); });
      this._toggle(list, 'Full-block auto step-up', (CONFIG.stepHeight ?? 0.6) > 0.9, v => { CONFIG.stepHeight = v ? 1.0 : 0.6; saveSettings(); });
      this._select(list, 'Difficulty', Object.keys(DIFFICULTIES), CONFIG.difficulty, v => { CONFIG.difficulty = v; saveSettings(); });
      const menu = el('div', 'menu-buttons', p);
      this._btn(menu, 'Back', () => (this.game.started ? this.openPause() : this.openMainMenu()));
    }, { menu: true });
  }

  openDeath() {
    this.open('death', (p) => {
      p.classList.add('death');
      el('h1', null, p).textContent = 'You Died';
      el('div', 'muted center', p).textContent = this.game.player.deathMessage;
      const menu = el('div', 'menu-buttons', p);
      this._btn(menu, 'Respawn', () => { this.close(); this.game.respawn(); });
      this._btn(menu, 'Quit to Menu', async () => { await this.game.save.save(); this.game.quitToMenu(); });
    }, { menu: true, panelClass: 'narrow' });
  }

  openMainMenu(saves = []) {
    this.open('menu', (p) => {
      el('h1', 'title', p).textContent = 'OREBOUND';
      el('div', 'subtitle', p).textContent = 'a voxel survival game';
      const menu = el('div', 'menu-buttons', p);

      if (saves.length > 0) {
        const s = saves[0];
        this._btn(menu, 'Continue', () => this.game.startFromSave(s.slot), 'primary');
        el('div', 'muted center small', p).textContent =
          `seed ${s.seed} • day ${Math.floor(s.time / CONFIG.dayLengthTicks) + 1} • ${formatBytes(s.size)}`;
      }

      const seedRow = el('div', 'field', menu);
      el('label', null, seedRow).textContent = 'World seed (blank = random)';
      const seedInput = el('input', null, seedRow);
      seedInput.type = 'text';
      seedInput.placeholder = 'e.g. 12345 or "amber hollow"';

      const diffRow = el('div', 'field', menu);
      el('label', null, diffRow).textContent = 'Difficulty';
      const diffSel = el('select', null, diffRow);
      for (const k of Object.keys(DIFFICULTIES)) {
        const o = el('option', null, diffSel);
        o.value = k; o.textContent = k[0].toUpperCase() + k.slice(1);
        if (k === CONFIG.difficulty) o.selected = true;
      }

      this._btn(menu, saves.length ? 'New World' : 'Play', () => {
        CONFIG.difficulty = diffSel.value;
        saveSettings();
        this.game.startNewWorld(seedInput.value);
      }, saves.length ? '' : 'primary');
      this._btn(menu, 'Controls & Help', () => this.openHelp());
      this._btn(menu, 'Settings', () => this.openSettings());
      if (saves.length > 0) {
        this._btn(menu, 'Delete Save', async () => {
          if (!confirm('Delete this world permanently?')) return;
          await this.game.save.deleteSave(saves[0].slot);
          this.game.showMainMenu();
        }, 'danger');
      }
      el('div', 'legal', p).textContent =
        'Original work inspired by the voxel-survival genre. All textures, sounds and code are procedurally generated or written from scratch.';
    }, { menu: true, panelClass: 'narrow' });
  }

  openLoading(text) {
    this.open('loading', (p) => {
      el('h1', 'title', p).textContent = 'OREBOUND';
      const s = el('div', 'muted center', p);
      s.textContent = text || 'Generating world...';
      this.loadingText = s;
      const bar = el('div', 'progress wide', p);
      this.loadFill = el('i', null, bar);
    }, { menu: true, panelClass: 'narrow' });
  }

  setLoading(fraction, text) {
    if (this.loadFill) this.loadFill.style.width = Math.round(fraction * 100) + '%';
    if (text && this.loadingText) this.loadingText.textContent = text;
  }

  // ------------------------------------------------------------- widgets
  _btn(parent, label, fn, cls = '') {
    const b = el('button', cls, parent);
    b.textContent = label;
    b.addEventListener('click', (e) => { e.preventDefault(); fn(); });
    return b;
  }
  _slider(parent, label, min, max, step, value, fn) {
    const row = el('div', 'setting', parent);
    const lab = el('label', null, row);
    lab.textContent = label;
    const val = el('span', 'val', lab);
    val.textContent = value;
    const input = el('input', null, row);
    input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = value;
    input.addEventListener('input', () => { val.textContent = input.value; fn(+input.value); });
    return input;
  }
  _toggle(parent, label, value, fn) {
    const row = el('div', 'setting', parent);
    const lab = el('label', null, row);
    lab.textContent = label;
    const btn = el('button', 'toggle', row);
    const set = v => { btn.textContent = v ? 'On' : 'Off'; btn.classList.toggle('on', v); };
    set(value);
    btn.addEventListener('click', () => { value = !value; set(value); fn(value); });
  }
  _select(parent, label, options, value, fn) {
    const row = el('div', 'setting', parent);
    el('label', null, row).textContent = label;
    const sel = el('select', null, row);
    for (const o of options) {
      const opt = el('option', null, sel);
      opt.value = o; opt.textContent = o[0].toUpperCase() + o.slice(1);
      if (o === value) opt.selected = true;
    }
    sel.addEventListener('change', () => fn(sel.value));
  }
}

function addToSlot(be, key, stack) {
  const cur = be[key];
  if (!cur) { be[key] = stack; return null; }
  if (!sameItem(cur, stack)) return stack;
  const limit = item(cur.id).stack;
  const move = Math.min(stack.count, limit - cur.count);
  cur.count += move; stack.count -= move;
  return stack.count > 0 ? stack : null;
}

function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}
