import { getLlama, LlamaChatSession } from "node-llama-cpp";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { ModelStore } = require("../src/models.cjs");
const { MODELS } = require("../src/catalog.cjs");
process.once("exit", code => console.log("Native inference process exit:", code));
const dir = process.env.COMPANION_VALIDATION_MODELS;
if (!dir)
  throw Error("Set COMPANION_VALIDATION_MODELS to a task-owned model folder.");
const store = new ModelStore(dir),
  m = MODELS[0];
try {
  await store.download(m, AbortSignal.timeout(300000), () => {});
} catch (error) {
  throw new Error(
    "Verified model setup failed. Inspect the network/checksum cause and retry the failed job; do not skip verification.",
    { cause: error },
  );
}
// Hosted Windows runners have no supported GPU; the packaged workflow still exercises automatic hardware selection.
const llama = await getLlama({
  build: "never",
  debug: process.env.COMPANION_INFERENCE_DEBUG === "1",
  gpu: process.platform === "win32" ? false : "auto",
  logLevel: "error",
});
const model = await llama.loadModel({ modelPath: store.location(m) });
console.log("Native model load mode:", JSON.stringify({mmap:model.useMmap,pid:process.pid,node:process.versions.node}));
const context = await model.createContext({ contextSize: 2048 });
try {
  const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
    systemPrompt: "Answer the user concisely. /no_think",
  });
  const text = await session.prompt("Reply with the word Hello.", {
    maxTokens: 80,
    temperature: 0,
    signal: AbortSignal.timeout(60000),
  });
  if (!text.trim()) throw Error("Local inference returned empty output.");
  console.log(
    "PASS: actual catalog model download, SHA-256 verification and native inference (GPU " +
      llama.gpu +
      "):",
    text.slice(0, 200),
  );
  session.dispose();
} finally {
  console.log("Disposing inference context.");
  await context.dispose();
  console.log("Disposing inference model.");
  await model.dispose();
  console.log("Disposing inference backend.");
  await llama.dispose();
  console.log("PASS: native inference resources disposed.");
}
