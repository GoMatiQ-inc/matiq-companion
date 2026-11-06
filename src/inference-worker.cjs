let api, llama, model, context, controller, loadedPath;
const requests = new Map();
let sequence = 0;
const send = (value) => process.send?.(value);
process.on("message", async (m) => {
  if (m.type === "tool-result") {
    const p = requests.get(m.id);
    if (p) {
      requests.delete(m.id);
      m.error ? p.reject(Error(m.error)) : p.resolve(m.result);
    }
    return;
  }
  if (m.type === "cancel") {
    controller?.abort();
    for (const p of requests.values()) p.reject(Error("Task stopped."));
    requests.clear();
    return;
  }
  if (m.type === "probe") {
    try {
      api ||= await import("node-llama-cpp");
      llama ||= await api.getLlama({ build: "never", logLevel: "error" });
      send({
        type: "runtime",
        gpu: llama.gpu,
        devices: await llama.getGpuDeviceNames(),
        vram: await llama.getVramState(),
      });
    } catch (e) {
      send({ type: "probe.error", error: e.message });
    }
    return;
  }
  if (m.type !== "prompt") return;
  try {
    controller = new AbortController();
    api ||= await import("node-llama-cpp");
    llama ||= await api.getLlama({ build: "never", logLevel: "error" });
    if (loadedPath !== m.modelPath) {
      loadedPath = null;
      await context?.dispose();
      context = null;
      await model?.dispose();
      model = await llama.loadModel({ modelPath: m.modelPath });
      context = null;
      loadedPath = m.modelPath;
    }
    await context?.dispose();
    context = await model.createContext({ contextSize: 4096 });
    send({
      type: "runtime",
      gpu: llama.gpu,
      devices: await llama.getGpuDeviceNames(),
      vram: await llama.getVramState(),
    });
    const session = new api.LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: m.system,
    });
    const history = [
      { type: "system", text: m.system },
      ...m.history
        .slice(-16)
        .filter((x) => x.role === "user" || x.role === "assistant")
        .map((x) =>
          x.role === "user"
            ? { type: "user", text: x.text }
            : { type: "model", response: [x.text] },
        ),
    ];
    session.setChatHistory(history);
    let calls = 0;
    const functions = {};
    for (const d of m.tools) {
      functions[d.name] = api.defineChatSessionFunction({
        description: d.description,
        params: d.params,
        handler: async (args) => {
          if (++calls > 12)
            throw Error(
              "Tool-call limit reached. Ask the user before continuing.",
            );
          if (controller.signal.aborted) throw Error("Task stopped.");
          const id = ++sequence;
          return new Promise((resolve, reject) => {
            requests.set(id, { resolve, reject });
            send({ type: "tool", id, name: d.name, args });
          });
        },
      });
    }
    const text = await session.prompt(m.text, {
      functions,
      signal: controller.signal,
      maxTokens: 1200,
      temperature: 0.2,
      onTextChunk: (text) => send({ type: "chunk", text }),
    });
    send({ type: "done", text });
    session.dispose();
  } catch (e) {
    send({ type: "error", error: e.message });
  } finally {
    controller = null;
  }
});
process.on("disconnect", () => process.exit(0));
