const { boundToolResult } = require("./tool-result.cjs");
const { createToolChatWrapper } = require("./chat-context.cjs");
let api, llama, model, context, controller, loadedPath, runtimePromise;
const requests = new Map();
let sequence = 0;
const send = (value) => process.send?.(value);
function initializeRuntime() {
  if(!runtimePromise) runtimePromise=(async()=>{
    send({type:"stage",stage:"initializing-runtime"});
    api ||= await import("node-llama-cpp");
    return api.getLlama({build:"never",logLevel:"error"});
  })().catch(error=>{runtimePromise=null;throw error;});
  return runtimePromise;
}
process.on("message", async (m) => {
  if (m.type === "tool-result") {
    const p = requests.get(m.id);
    if (p) {
      requests.delete(m.id);
      if (m.error) p.reject(Error(m.error));
      else {
        try { p.resolve(boundToolResult(m.result, p.countTokens)); }
        catch (error) { p.reject(error); }
      }
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
      llama = await initializeRuntime();
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
    llama = await initializeRuntime();
    if (loadedPath !== m.modelPath) {
      loadedPath = null;
      send({type:"stage",stage:"releasing-model"});
      await context?.dispose();
      context = null;
      await model?.dispose();
      send({type:"stage",stage:"loading-model"});
      model = await llama.loadModel({ modelPath: m.modelPath });
      context = null;
      loadedPath = m.modelPath;
    }
    await context?.dispose();
    send({type:"stage",stage:"creating-context"});
    context = await model.createContext({ contextSize: 4096 });
    send({
      type: "runtime",
      gpu: llama.gpu,
      devices: await llama.getGpuDeviceNames(),
      vram: await llama.getVramState(),
    });
    const functions = {};
    const session = new api.LlamaChatSession({
      chatWrapper: createToolChatWrapper(api, model, functions),
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
            requests.set(id, {
              resolve, reject,
              countTokens: result => session.chatWrapper.generateFunctionCallResult(d.name, args, result).tokenize(model.tokenizer).length,
            });
            send({ type: "tool", id, name: d.name, args });
          });
        },
      });
    }
    send({type:"stage",stage:"generating-response"});
    const text = await session.prompt(m.text, {
      functions,
      signal: controller.signal,
      maxTokens: 1200,
      temperature: 0.2,
      budgets: { thoughtTokens: 0 },
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
