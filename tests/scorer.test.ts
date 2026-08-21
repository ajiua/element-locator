import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCandidate } from '../src/content/scorer';

test('base scores', () => {
  assert.equal(scoreCandidate({ kind: 'id', parentContext: false, tagExact: false }), 100);
  assert.equal(scoreCandidate({ kind: 'data-testid', parentContext: false, tagExact: false }), 90);
  assert.equal(scoreCandidate({ kind: 'name', parentContext: false, tagExact: false }), 80);
  assert.equal(scoreCandidate({ kind: 'class', parentContext: false, tagExact: false }), 50);
  assert.equal(scoreCandidate({ kind: 'position', parentContext: false, tagExact: false }), -30);
  assert.equal(scoreCandidate({ kind: 'absolute', parentContext: false, tagExact: false }), -100);
});

test('parent context bonus', () => {
  assert.equal(scoreCandidate({ kind: 'text', parentContext: true, tagExact: false }), 70);
});

test('exact tag bonus', () => {
  assert.equal(scoreCandidate({ kind: 'id', parentContext: false, tagExact: true }), 105);
  assert.equal(scoreCandidate({ kind: 'text', parentContext: true, tagExact: true }), 75);
});
