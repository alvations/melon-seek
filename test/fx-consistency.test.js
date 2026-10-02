// One exchange-rate table, several copies (browser palette, juice, salary
// vetting). This test fails if any copy drifts from public/viz/palette.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FX_TO_USD as PALETTE } from '../public/viz/palette.js';
import { FX_TO_USD as JUICE } from '../server/juice.js';
import { USD_PER as SALARY } from '../server/salary.js';

const close = (a, b) => Math.abs(a - b) / b < 0.01;

test('juice FX equals the palette FX', () => {
  for (const [c, v] of Object.entries(PALETTE)) assert.ok(close(JUICE[c], v), `${c}: juice ${JUICE[c]} vs palette ${v}`);
});

test('salary vetting FX agrees with the palette within 1% for shared currencies', () => {
  for (const [c, v] of Object.entries(SALARY)) {
    if (PALETTE[c] == null) continue;
    assert.ok(close(v, PALETTE[c]), `${c}: salary.js ${v} vs palette ${PALETTE[c]}`);
  }
});
