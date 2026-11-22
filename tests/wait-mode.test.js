'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/\/\* WAIT-MODE-LOGIC:START \*\/([\s\S]*?)\/\* WAIT-MODE-LOGIC:END \*\//);
assert.ok(m, 'WAIT-MODE-LOGIC markers not found in index.html');
const wait = new Function(m[1] + '\nreturn { waitFindGroup, waitPress, waitIsOpen, waitHandWants, WAIT_EARLY_SEC };')();

const note = (pitch, startTime, track) => ({ pitch, startTime, endTime: startTime + 0.5, track: track || 0 });
const any = () => true;

test('single note group', () => {
  const g = wait.waitFindGroup([note(60, 1), note(62, 2)], 0, any);
  assert.deepEqual(g.pitches, [60]);
  assert.equal(g.time, 1);
  assert.equal(g.endIdx, 1);
});

test('chord collects all notes within the chord window', () => {
  const g = wait.waitFindGroup([note(60, 1), note(64, 1.01), note(67, 1.02), note(72, 2)], 0, any);
  assert.deepEqual(g.pitches, [60, 64, 67]);
  assert.equal(g.endIdx, 3);
});

test('same pitch twice in a chord counts once', () => {
  const g = wait.waitFindGroup([note(60, 1, 0), note(60, 1, 1)], 0, any);
  assert.deepEqual(g.pitches, [60]);
});

test('hand filter skips notes of the other hand', () => {
  const notes = [note(40, 1, 1), note(60, 1.5, 0), note(43, 1.5, 1)];
  const right = (n) => n.track === 0;
  const g = wait.waitFindGroup(notes, 0, right);
  assert.deepEqual(g.pitches, [60]);
  assert.equal(g.time, 1.5);
});

test('starts at fromIdx and returns null when nothing is left', () => {
  const notes = [note(60, 1), note(62, 2)];
  assert.deepEqual(wait.waitFindGroup(notes, 1, any).pitches, [62]);
  assert.equal(wait.waitFindGroup(notes, 2, any), null);
  assert.equal(wait.waitFindGroup(notes, 0, () => false), null);
});

test('waitPress removes a right pitch and ignores a wrong one', () => {
  assert.deepEqual(wait.waitPress([60, 64], 64), [60]);
  assert.deepEqual(wait.waitPress([60, 64], 61), [60, 64]);
  assert.deepEqual(wait.waitPress([60], 60), []);
});

test('chord needs every note, in any order', () => {
  let rest = [60, 64, 67];
  rest = wait.waitPress(rest, 67);
  rest = wait.waitPress(rest, 61);
  assert.equal(rest.length, 2);
  rest = wait.waitPress(rest, 60);
  rest = wait.waitPress(rest, 64);
  assert.equal(rest.length, 0);
});

test('waitPress does not mutate its input', () => {
  const rest = [60, 64];
  wait.waitPress(rest, 60);
  assert.deepEqual(rest, [60, 64]);
});

test('waitIsOpen accepts an early press inside the window only', () => {
  const g = { time: 10 };
  assert.equal(wait.waitIsOpen(g, 10 - wait.WAIT_EARLY_SEC - 0.01), false);
  assert.equal(wait.waitIsOpen(g, 10 - wait.WAIT_EARLY_SEC), true);
  assert.equal(wait.waitIsOpen(g, 11), true);
});

test('waitHandWants', () => {
  assert.equal(wait.waitHandWants('both', 'left'), true);
  assert.equal(wait.waitHandWants('left', 'left'), true);
  assert.equal(wait.waitHandWants('left', 'right'), false);
  assert.equal(wait.waitHandWants('right', 'left'), false);
});
