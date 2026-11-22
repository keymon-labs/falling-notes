'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/\/\* BLE-MIDI-PARSER:START \*\/([\s\S]*?)\/\* BLE-MIDI-PARSER:END \*\//);
assert.ok(m, 'BLE-MIDI-PARSER markers not found in index.html');
const { parseBleMidi } = new Function(m[1] + '\nreturn { parseBleMidi };')();

const parse = (arr, st) => parseBleMidi(Uint8Array.from(arr), st);

test('note on with header and timestamp', () => {
  const r = parse([0xB5, 0xE1, 0x90, 0x3C, 0x64]);
  assert.deepEqual(r.messages, [[0x90, 0x3C, 0x64]]);
  assert.equal(r.status, 0x90);
});

test('two messages with their own timestamps and statuses', () => {
  const r = parse([0x80, 0x81, 0x90, 60, 100, 0x82, 0x80, 60, 0]);
  assert.deepEqual(r.messages, [[0x90, 60, 100], [0x80, 60, 0]]);
});

test('running status after a timestamp byte', () => {
  const r = parse([0x80, 0x81, 0x90, 60, 100, 0x82, 64, 90]);
  assert.deepEqual(r.messages, [[0x90, 60, 100], [0x90, 64, 90]]);
});

test('running status without a timestamp byte', () => {
  const r = parse([0x80, 0x81, 0x90, 60, 100, 64, 90]);
  assert.deepEqual(r.messages, [[0x90, 60, 100], [0x90, 64, 90]]);
});

test('running status carries into the next packet', () => {
  const first = parse([0x80, 0x81, 0x90, 60, 100]);
  const second = parse([0x80, 0x82, 62, 80], first.status);
  assert.deepEqual(second.messages, [[0x90, 62, 80]]);
});

test('sustain pedal control change', () => {
  assert.deepEqual(parse([0x80, 0x81, 0xB0, 64, 127]).messages, [[0xB0, 64, 127]]);
});

test('one-data-byte messages (program change)', () => {
  const r = parse([0x80, 0x81, 0xC0, 5, 0x82, 0x90, 60, 1]);
  assert.deepEqual(r.messages, [[0xC0, 5], [0x90, 60, 1]]);
});

test('system exclusive is skipped and cancels running status', () => {
  const r = parse([0x80, 0x81, 0xF0, 1, 2, 3, 0x82, 0xF7, 0x83, 0x90, 60, 100]);
  assert.deepEqual(r.messages, [[0x90, 60, 100]]);
  const r2 = parse([0x80, 0x81, 0xF0, 1, 2, 0x82, 0xF7, 0x83, 61, 100]);
  assert.deepEqual(r2.messages, []);
});

test('realtime message keeps running status', () => {
  const r = parse([0x80, 0x81, 0x90, 60, 100, 0x82, 0xF8, 0x83, 64, 90]);
  assert.deepEqual(r.messages, [[0x90, 60, 100], [0xF8], [0x90, 64, 90]]);
});

test('truncated message is dropped', () => {
  assert.deepEqual(parse([0x80, 0x81, 0x90, 60]).messages, []);
});

test('invalid or empty packets give nothing and do not hang', () => {
  assert.deepEqual(parse([]).messages, []);
  assert.deepEqual(parse([0x80]).messages, []);
  assert.deepEqual(parse([0x10, 0x90, 60, 100]).messages, []);
  assert.deepEqual(parse([0x80, 0x81, 0xF4, 5, 6, 0x82, 0x90, 60, 100]).messages, [[0x90, 60, 100]]);
});

test('data bytes with no known status are ignored', () => {
  assert.deepEqual(parse([0x80, 60, 100]).messages, []);
});
