const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");

async function verifyContextShift(api, model, worker) {
  const requireWorker = createRequire(worker);
  const { createToolChatWrapper } = requireWorker("./chat-context.cjs");
  const { boundToolResult } = requireWorker("./tool-result.cjs");
  const { Tools } = requireWorker("./tools.cjs");
  const functions = Object.fromEntries(new Tools({}).definitions({tools:{computer:true}})
    .map(d => [d.name, api.defineChatSessionFunction({
      description: d.description, params: d.params,
      handler: () => { throw Error("The context-size regression must not execute a computer action."); },
    })]));
  const plain = api.resolveChatWrapper(model);
  const wrapped = createToolChatWrapper(api, model, functions);
  const result = boundToolResult({
    width:1920, height:1080, text:"large screen ".repeat(1500),
    words:Array.from({length:300},(_,i)=>({text:"word-"+i,x:i,y:i+20,confidence:99})),
  }, value => plain.generateFunctionCallResult("observe_screen",{},value).tokenize(model.tokenizer).length);
  const history = [
    {type:"system",text:"Preserve this system instruction. "+"context ".repeat(230)},
    {type:"user",text:"Observe the screen and report its current contents."},
    {type:"model",response:Array.from({length:4},()=>({
      type:"functionCall",name:"observe_screen",params:{},result,startsNewChunk:true,
    }))},
  ];
  // Test the exact compressor shipped by the pinned dependency; the app uses no private API.
  const entry = pathToFileURL(requireWorker.resolve("node-llama-cpp"));
  const { compressHistoryToFitContextSize } = await import(
    new URL("./evaluator/LlamaChat/utils/compressHistoryToFitContextSize.js",entry).href);
  const options = {history,contextSize:4096,contextShiftSize:409,
    contextShiftStrategy:"eraseFirstResponseAndKeepFirstSystem",
    tokenizer:model.tokenizer,functions};
  const count = (wrapper,h,availableFunctions=functions) => wrapper.generateContextState({
    chatHistory:h,availableFunctions,
  }).contextText.tokenize(model.tokenizer).length;
  const before = count(plain,history);
  assert.ok(before>4096,"Construct repeated observations that actually exceed the model context.");
  await assert.rejects(compressHistoryToFitContextSize({...options,chatWrapper:plain}),
    /default context shift strategy did not return a history that fits/,
    "The unadapted dependency must reproduce the observed accounting failure.");
  const {compressedHistory} = await compressHistoryToFitContextSize({...options,chatWrapper:wrapped});
  const after = count(wrapped,compressedHistory);
  assert.ok(after<=3687,"Retain room for generation after counting all tool definitions.");
  assert.equal(compressedHistory[0].text,history[0].text);
  assert.deepEqual(compressedHistory.at(-1).response.at(-1).result,result,
    "History compression must preserve the latest observation.");
  assert.equal(count(wrapped,history,{}),count(plain,history,{}),
    "An explicit empty function set must remain empty.");
  return {before,after,maximum:3687,functions:Object.keys(functions).length,
    baselineRejected:true,latestObservationRetained:true};
}
module.exports = { verifyContextShift };
