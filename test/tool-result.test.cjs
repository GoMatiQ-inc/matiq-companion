const test = require('node:test');
const assert = require('node:assert/strict');
const { boundToolResult } = require('../src/tool-result.cjs');
const tokenize = text => Array.from(text);
const countTokens = value => tokenize(JSON.stringify(value)).length;

test('small tool results retain every field', () => {
  const result = { attempted: true, note: 'Observe again to verify the target.' };
  assert.deepEqual(boundToolResult(result, countTokens), result);
});
test('large OCR results retain complete coordinate entries within the model token budget', () => {
  const result = { width: 1920, height: 1080, text: 'unbounded OCR '.repeat(2000),
    words: Array.from({ length: 300 }, (_, i) => ({ text: 'word-' + i, x: i, y: i + 20, confidence: 99 })) };
  const bounded = boundToolResult(result, countTokens), serialized = JSON.stringify(bounded);
  assert.ok(tokenize(serialized).length <= 1024);
  assert.equal(bounded.width, 1920); assert.equal(bounded.height, 1080);
  assert.equal(bounded.truncated, true); assert.equal(bounded.totalWords, 300);
  assert.ok(bounded.words.length > 0 && bounded.words.length < 300);
  assert.deepEqual(bounded.words[0], ['word-0', 0, 20]);
  assert.deepEqual(bounded.words.at(-1), ['word-' + (bounded.words.length - 1), bounded.words.length - 1, bounded.words.length + 19]);
  assert.match(bounded.note, /omitted/); assert.equal(bounded.text, undefined);
});
test('oversized file or web content returns valid JSON with explicit unknown-content notice', () => {
  const bounded = boundToolResult({ text: '漢字🙂'.repeat(10000) }, countTokens), serialized = JSON.stringify(bounded);
  assert.ok(tokenize(serialized).length <= 1024);
  assert.equal(bounded.truncated, true); assert.ok(bounded.excerpt.startsWith('{"text":'));
  assert.match(bounded.note, /omitted content is unknown/);
});

test('the actual Qwen wrapper framing and escaped result content fit the budget', async () => {
  const { QwenChatWrapper } = await import('node-llama-cpp');
  const wrapper = new QwenChatWrapper();
  const count = value => tokenize(wrapper.generateFunctionCallResult('observe_screen', {}, value).toString()).length;
  const result = { width: 1920, height: 1080,
    words: Array.from({ length: 300 }, (_, i) => ({ text: 'quoted "word" with \\slashes-' + i, x: i, y: i })) };
  const bounded = boundToolResult(result, count);
  assert.equal(typeof bounded, 'object');
  assert.ok(count(bounded) <= 1024);
  assert.equal(bounded.truncated, true);
  assert.ok(bounded.words.length > 0);
});
test('unbounded wrapper metadata fails visibly instead of claiming a bounded result', () => {
  assert.throws(() => boundToolResult({ text: 'large' }, () => 1025), /metadata exceeds/);
});
