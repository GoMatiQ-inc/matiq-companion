const { fork } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { Projects } = require("../src/projects.cjs");
const { Tools } = require("../src/tools.cjs");
const { MODELS } = require("../src/catalog.cjs");
const { ModelStore } = require("../src/models.cjs");
const { readWord } = require("../src/documents.cjs");
(async () => {
  if (!process.env.COMPANION_VALIDATION_MODELS)
    throw Error(
      "Set COMPANION_VALIDATION_MODELS to an isolated, verified model store.",
    );
  const store = new ModelStore(process.env.COMPANION_VALIDATION_MODELS);
  assert.ok(await store.verify(MODELS[0]));
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "companion-tools-")),
  );
  let child;
  try {
    const projects = new Projects(path.join(dir, "projects"));
    const project = await projects.create("Tool verification");
    project.tools.documents = true;
    await projects.save(project);
    let calls = 0;
    const tools = new Tools({
      projects,
      approve: async (request) => {
        assert.equal(request.name, "create_word");
        calls++;
        return true;
      },
    });
    child = fork(path.join(__dirname, "../src/inference-worker.cjs"), [], {
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    let diagnostics = "";
    child.stderr.on("data", (b) => {
      diagnostics = (diagnostics + b).slice(-2000);
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Tool inference timed out")),
        180000,
      );
      const finish = (error) => {
        clearTimeout(timer);
        error ? reject(error) : resolve();
      };
      child.on("error", finish);
      child.on("exit", (code) => {
        if (code !== null && code !== 0)
          finish(Error("Worker exited " + code + " " + diagnostics));
      });
      child.on("message", async (m) => {
        if (m.type === "runtime") console.log("Tool worker runtime:", m.gpu);
        if (m.type === "tool") {
          try {
            assert.equal(m.name, "create_word");
            assert.equal(m.args.path, "proof.docx");
            const result = await tools.run(project.id, m.name, m.args);
            child.send({
              type: "tool-result",
              id: m.id,
              result: JSON.stringify(result),
            });
            console.log("Actual document tool completed");
            finish();
          } catch (e) {
            finish(e);
          }
        } else if (m.type === "error") finish(Error(m.error));
        else if (m.type === "done") finish();
      });
      child.send({
        type: "prompt",
        modelPath: store.location(MODELS[0]),
        history: [],
        tools: tools
          .definitions(project)
          .filter((t) => t.name === "create_word"),
        system:
          "You are a local file assistant. Use the create_word tool when asked for a document. Never merely describe doing the task. /no_think",
        text: 'Call create_word now with path "proof.docx", title "Verification", paragraphs ["Local tools work."]. After the tool succeeds, say Done.',
      });
    });
    assert.ok(
      calls > 0,
      "The real model must invoke the actual document tool.",
    );
    const paragraphs = readWord(
      await fs.readFile(
        path.join(projects.folder(project.id), "files", "proof.docx"),
      ),
    );
    assert.ok(JSON.stringify(paragraphs).includes("Local tools work."));
    console.log(
      "PASS: real local model invoked approved create_word; real DOCX bytes read back.",
    );
  } finally {
    if (child) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await Promise.race([
        exited,
        new Promise((_, reject) =>
          setTimeout(() => {
            child.kill("SIGKILL");
            reject(Error("Inference child did not exit"));
          }, 5000).unref(),
        ),
      ]);
    }
    await fs.rm(dir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
