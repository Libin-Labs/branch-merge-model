import test from 'node:test';
import assert from 'node:assert/strict';
import {
  semanticDiff,
  previewMerge,
  BranchMergeModel,
  BranchMergeError,
} from '../dist/esm/index.js';

test('documented workflow produces required outputs', async () => {
  const history = new BranchMergeModel();
  history.commit('base', null, { a: 1, b: 1 });
  history.commit('left', 'base', { a: 2, b: 1 });
  history.commit('right', 'base', { a: 1, b: 2 });
  const preview = history.preview('left', 'right');
  assert.equal(preview.ancestor, 'base');
  assert.deepEqual(preview.snapshot, { a: 2, b: 2 });
  assert.equal(semanticDiff({ a: 1 }, { a: 2 }).length, 1);
  assert.equal(previewMerge({ a: 1 }, { a: 2 }, { a: 3 }).conflicts.length, 1);
});
test('deletion versus modification conflicts', () => {
  const p = previewMerge({ x: 1 }, {}, { x: 2 });
  assert.equal(p.conflicts.length, 1);
  assert.deepEqual(p.snapshot, { x: 1 });
});
test('object ordering is semantic, arrays atomic', () => {
  assert.deepEqual(semanticDiff({ x: { a: 1, b: 2 } }, { x: { b: 2, a: 1 } }), []);
  assert.equal(previewMerge({ x: [1] }, { x: [2] }, { x: [3] }).conflicts.length, 1);
});
test('missing ancestors and duplicate commits reject', () => {
  const h = new BranchMergeModel();
  h.commit('a', null, {});
  assert.throws(() => h.commit('a', null, {}));
  assert.throws(() => h.commit('b', 'missing', {}), { code: 'missing' });
});
test('snapshots detached and unresolved merge cannot commit', () => {
  const h = new BranchMergeModel();
  h.commit('a', null, { x: 0 });
  h.commit('b', 'a', { x: 1 });
  h.commit('c', 'a', { x: 2 });
  h.get('a').snapshot.x = 9;
  assert.equal(h.get('a').snapshot.x, 0);
  assert.throws(() => h.merge('d', 'b', 'c'), { code: 'conflict' });
});
