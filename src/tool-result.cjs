// Bound results with the loaded model's tokenizer, including the truncation notice.
function boundToolResult(result, tokenize) {
  const budget = 1024;
  const encode = value => JSON.stringify(value);
  const fits = value => tokenize(encode(value)).length <= budget;
  if (fits(result)) return result;
  if (Array.isArray(result.words)) {
    const words = result.words.map(word => [word.text, word.x, word.y]);
    const screen = count => ({
      width: result.width,
      height: result.height,
      words: words.slice(0, count),
      truncated: true,
      totalWords: words.length,
      note: 'Word entries are [text, x, y] in primary-screen logical pixels. Only the first words that fit the local model context are included; remaining words and duplicate OCR text are omitted. Observe again before acting.',
    });
    if (fits(screen(0))) return screen(largestPrefix(words.length, count => fits(screen(count))));
  }
  const text = encode(result);
  const excerpt = count => ({
    truncated: true,
    excerpt: text.slice(0, count),
    note: 'Only a prefix of the tool result fits the local model context. This excerpt may end inside a value; omitted content is unknown. Request a smaller result before relying on missing details.',
  });
  return excerpt(largestPrefix(text.length, count => fits(excerpt(count))));
}
function largestPrefix(length, fits) {
  let low = 0, high = length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(middle)) low = middle;
    else high = middle - 1;
  }
  return low;
}
module.exports = { boundToolResult };
