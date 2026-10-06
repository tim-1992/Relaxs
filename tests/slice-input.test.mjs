import test from 'node:test';
import assert from 'node:assert/strict';
import {pointOnSliceArena, sliceKeyboardCommand, moveSliceCursor} from '../src/slice-input.js';

test('pointer coordinates track the arena after scrolling or CSS scaling', () => {
  const rect = {left: 40, top: -90, width: 400, height: 300};
  assert.deepEqual(pointOnSliceArena(rect, 800, 600, {clientX: 240, clientY: 60}), {x: 400, y: 300});
  assert.deepEqual(pointOnSliceArena(rect, 800, 600, {clientX: -20, clientY: 500}), {x: 0, y: 600});
  assert.equal(pointOnSliceArena({...rect, width: 0}, 800, 600, {clientX: 40, clientY: 20}), null);
});

test('keyboard controls do not consume text inputs, modifiers or repeated blade starts', () => {
  assert.equal(sliceKeyboardCommand({key: 'ArrowLeft'}), 'left');
  assert.equal(sliceKeyboardCommand({key: ' '}), 'blade');
  assert.equal(sliceKeyboardCommand({key: ' ', repeat: true}), null);
  assert.equal(sliceKeyboardCommand({key: 'ArrowLeft', ctrlKey: true}), null);
  assert.equal(sliceKeyboardCommand({key: ' ', target: {tagName: 'BUTTON'}}), null);
  assert.equal(sliceKeyboardCommand({key: 'ArrowLeft', target: {tagName: 'TEXTAREA'}}), null);
  assert.equal(sliceKeyboardCommand({key: 'ArrowLeft', target: {isContentEditable: true}}), null);
});

test('keyboard blade moves at the same speed diagonally and remains in bounds', () => {
  const start = {x: 200, y: 200};
  const horizontal = moveSliceCursor(start, new Set(['right']), .1, 800, 600);
  const diagonal = moveSliceCursor(start, new Set(['right', 'up']), .1, 800, 600);
  assert.ok(Math.abs(Math.hypot(diagonal.x - 200, diagonal.y - 200) - (horizontal.x - 200)) < 1e-8);
  assert.deepEqual(moveSliceCursor({x: 1, y: 1}, new Set(['left', 'up']), .1, 800, 600), {x: 0, y: 0});
  assert.deepEqual(moveSliceCursor(start, new Set(), .1, 800, 600), start);
});
