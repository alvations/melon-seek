// fix-touch-tips (docs/process/fix-touch-tips.md): the shared rule for floating tips on touch, in
// public/features/shared.js. The browser behaviour (taps, the iPhone's emulated mouse events, scrolls) is in
// test/e2e/fix-touch-tips.e2e.js; these are the pure parts: the words, how an event is classed, where a tapped
// tip goes, and when the closer closes a tip.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { actionHint, isTouchInput, placeNearTap, tipCloser, TOUCH_GRACE_MS } from '../public/features/shared.js';

describe('fix-touch-tips: words and input', () => {
  test('actionHint: the words follow the input', () => {
    assert.equal(actionHint('mouse', 'see these roles'), 'Click to see these roles');
    assert.equal(actionHint('touch', 'see these roles'), 'Tap again to see these roles');
    assert.equal(actionHint('keyboard', 'see these roles'), 'Press Enter to see these roles');
    assert.doesNotMatch(actionHint('keyboard', 'x'), /click|tap/i);
    assert.doesNotMatch(actionHint('touch', 'x'), /click/i);
  });

  test('isTouchInput: a touch, the mouse events made from one, and a real mouse', () => {
    assert.ok(TOUCH_GRACE_MS >= 500 && TOUCH_GRACE_MS <= 2000, 'the grace after a touch covers iOS\'s emulated mouse events');
    assert.equal(isTouchInput({ type: 'pointermove', pointerType: 'touch' }), true);
    assert.equal(isTouchInput({ type: 'click', pointerType: 'touch', detail: 1 }), true);
    // Chromium marks the mouse events it makes from a touch.
    assert.equal(isTouchInput({ type: 'mousemove', sourceCapabilities: { firesTouchEvents: true } }), true);
    // No touch has happened in this process, so a mouse is a mouse.
    assert.equal(isTouchInput({ type: 'pointermove', pointerType: 'mouse' }), false);
    assert.equal(isTouchInput({ type: 'click', detail: 1 }), false);
    assert.equal(isTouchInput(), false);
  });
});

describe('fix-touch-tips: placeNearTap', () => {
  const withScreen = (w, h, fn) => {
    const prev = [globalThis.innerWidth, globalThis.innerHeight];
    globalThis.innerWidth = w; globalThis.innerHeight = h;
    try { fn(); } finally { [globalThis.innerWidth, globalThis.innerHeight] = prev; }
  };
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

  test('above the tapped row, clear of the finger, centred on the tap and inside the screen', () => {
    withScreen(390, 844, () => {
      const row = rect(24, 500, 342, 44);
      const p = placeNearTap(row, 250, 110, 200);
      assert.equal(p.top, 500 - 110 - 8, 'its bottom is 8 px over the row');
      assert.equal(p.left, 200 - 125);
      // A tap near the left edge keeps the tip 8 px inside; near the right, too.
      assert.equal(placeNearTap(row, 250, 110, 30).left, 8);
      assert.equal(placeNearTap(row, 250, 110, 385).left, 390 - 250 - 8);
    });
  });

  test('below the row when there is no room above; never off the top or bottom', () => {
    withScreen(360, 740, () => {
      const top = rect(0, 60, 360, 44);
      assert.equal(placeNearTap(top, 250, 110, 180).top, 60 + 44 + 8);
      const tall = placeNearTap(rect(0, 20, 360, 700), 250, 300, 180);
      assert.ok(tall.top >= 8 && tall.top + 300 <= 740 - 8 + 0.5, JSON.stringify(tall));
    });
  });
});

describe('fix-touch-tips: tipCloser', () => {
  /** A fake document and window with listeners, and an anchor whose position a test moves. */
  function fakeDom() {
    const make = () => {
      const ls = {};
      return {
        ls,
        addEventListener(t, f) { (ls[t] ||= new Set()).add(f); },
        removeEventListener(t, f) { ls[t]?.delete(f); },
        fire(t, e = {}) { for (const f of [...(ls[t] || [])]) f({ type: t, ...e }); },
        count() { return Object.values(ls).reduce((n, s) => n + s.size, 0); },
      };
    };
    const doc = make(), win = make();
    doc.visibilityState = 'visible';
    const node = (name, parent = null) => ({ name, parent, isConnected: true, pos: [10, 100], contains(o) { for (let n = o; n; n = n.parent) if (n === this) return true; return false; }, getBoundingClientRect() { return { left: this.pos[0], top: this.pos[1] }; } });
    const prev = [globalThis.document, globalThis.window];
    globalThis.document = doc; globalThis.window = win;
    return { doc, win, node, restore() { [globalThis.document, globalThis.window] = prev; } };
  }

  test('a press outside closes; a press inside does not; it closes once and leaves no listener', () => {
    const d = fakeDom();
    try {
      const list = d.node('list'), row = d.node('row', list), other = d.node('other');
      let closed = 0;
      const c = tipCloser(() => { closed++; });
      c.arm({ inside: [list], anchor: row });
      assert.ok(c.armed && d.doc.count() + d.win.count() > 0);
      d.doc.fire('pointerdown', { target: row });
      assert.equal(closed, 0, 'a press on its own list keeps the tip');
      d.doc.fire('pointerdown', { target: other });
      assert.equal(closed, 1, 'a press elsewhere closes it');
      d.doc.fire('pointerdown', { target: other });
      assert.equal(closed, 1, 'once');
      assert.equal(c.armed, false);
      assert.equal(d.doc.count() + d.win.count(), 0, 'no listener is left');
    } finally { d.restore(); }
  });

  test('a scroll that moves the anchor closes a pointer tip; a scroll elsewhere does not; a removed anchor closes', () => {
    const d = fakeDom();
    try {
      const row = d.node('row');
      let closed = 0;
      const c = tipCloser(() => { closed++; });
      c.arm({ inside: [row], anchor: row });
      d.win.fire('scroll');
      assert.equal(closed, 0, 'another box scrolled: the anchor did not move');
      row.pos = [10, 40];
      d.win.fire('scroll');
      assert.equal(closed, 1, 'its row scrolled away: the tip closes, it never stays in viewport pixels');
      c.arm({ inside: [row], anchor: row });
      row.isConnected = false;
      d.win.fire('scroll');
      assert.equal(closed, 2, 'the row was re-rendered away');
    } finally { d.restore(); }
  });

  test('a keyboard tip follows its anchor, and closes once follow() says it left the screen; resize and hiding close', () => {
    const d = fakeDom();
    try {
      const row = d.node('row');
      let closed = 0, followed = 0, onScreen = true;
      const c = tipCloser(() => { closed++; });
      c.arm({ inside: [row], anchor: row, follow: () => { followed++; return onScreen; } });
      row.pos = [10, 80];
      d.win.fire('scroll');
      assert.equal(followed, 1);
      assert.equal(closed, 0, 'it followed');
      d.win.fire('scroll');
      assert.equal(followed, 1, 'no move since: nothing to do');
      onScreen = false; row.pos = [10, -200];
      d.win.fire('scroll');
      assert.equal(closed, 1, 'off screen: closed');
      c.arm({ inside: [row], anchor: row });
      d.win.fire('resize');
      assert.equal(closed, 2, 'a resize closes it');
      c.arm({ inside: [row], anchor: row });
      d.doc.visibilityState = 'hidden';
      d.doc.fire('visibilitychange');
      assert.equal(closed, 3, 'the page hiding closes it');
    } finally { d.restore(); }
  });
});
