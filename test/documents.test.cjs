const test = require("node:test");
const assert = require("node:assert/strict");
const d = require("../src/documents.cjs");
test("DOCX creation, reading and paragraph replacement preserve other paragraphs", async () => {
  const input = await d.createWord("A report", [
    "First paragraph",
    "Second paragraph",
  ]);
  assert.deepEqual(
    d.readWord(input).map((p) => p.text),
    ["A report", "First paragraph", "Second paragraph"],
  );
  const output = d.replaceWord(input, 1, "New <safe> text & more");
  assert.deepEqual(
    d.readWord(output).map((p) => p.text),
    ["A report", "New <safe> text & more", "Second paragraph"],
  );
  assert.throws(() => d.replaceWord(input, 99, "no"), /existing paragraph/);
});
test("XLSX updates preserve other sheets/cells and reject arbitrary cell objects", async () => {
  const input = await d.createWorkbook("Budget", [
    ["Item", "Amount"],
    ["Hosting", 50],
    ["Travel", 100],
  ]);
  const output = await d.setCells(input, "Budget", [
    { address: "B2", value: 60 },
  ]);
  const read = await d.readWorkbook(output);
  assert.equal(read[0].rows[1][1], 60);
  assert.equal(read[0].rows[2][1], 100);
  await assert.rejects(d.setCells(input, "Missing", []), /existing sheet/);
  await assert.rejects(
    d.createWorkbook("X", [[{ formula: 'HYPERLINK("evil")' }]]),
    /plain/,
  );
});
