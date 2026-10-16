import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breakpointFor } from './useBreakpoint.js';

test('faixas: celular até 640, tablet até 1024, PC acima', () => {
  assert.equal(breakpointFor(375), 'phone');
  assert.equal(breakpointFor(640), 'phone');
  assert.equal(breakpointFor(641), 'tablet');
  assert.equal(breakpointFor(1024), 'tablet');
  assert.equal(breakpointFor(1025), 'desktop');
});
