const test = require('node:test');
const assert = require('node:assert/strict');
const { serializeToolResult } = require('../src/tool-result.cjs');
const tokenize = text => Array.from(text);

test('small tool results retain every field', () => {
  const result = { attempted: true, note: 'Observe again to verify the target.' };
  assert.deepEqual(JSON.parse(serializeToolResult(result, tokenize)), result);
});
test('large OCR results retain complete coordinate entries within the model token budget', () => {
  const result = { width: 1920, height: 1080, text: 'unbounded OCR '.repeat(2000),
    words: Array.from({ length: 300 }, (_, i) => ({ text: 'word-' + i, x: i, y: i + 20, confidence: 99 })) };
  const serialized = serializeToolResult(result, tokenize), bounded = JSON.parse(serialized);
  assert.ok(tokenize(serialized).length <= 1024);
  assert.equal(bounded.width, 1920); assert.equal(bounded.height, 1080);
  assert.equal(bounded.truncated, true); assert.equal(bounded.totalWords, 300);
  assert.ok(bounded.words.length > 0 && bounded.words.length < 300);
  assert.deepEqual(bounded.words[0], ['word-0', 0, 20]);
  assert.deepEqual(bounded.words.at(-1), ['word-' + (bounded.words.length - 1), bounded.words.length - 1, bounded.words.length + 19]);
  assert.match(bounded.note, /omitted/); assert.equal(bounded.text, undefined);
});
test('oversized file or web content returns valid JSON with explicit unknown-content notice', () => {
  const serialized = serializeToolResult({ text: '漢字🙂'.repeat(10000) }, tokenize), bounded = JSON.parse(serialized);
  assert.ok(tokenize(serialized).length <= 1024);
  assert.equal(bounded.truncated, true); assert.ok(bounded.excerpt.startsWith('{"text":'));
  assert.match(bounded.note, /omitted content is unknown/);
});
