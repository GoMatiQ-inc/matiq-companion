// The pinned compressor omits availableFunctions when estimating history size.
// Keep its estimates consistent with the actual model prompt, including tool schemas.
function createToolChatWrapper(api, model, functions) {
  const wrapper = api.resolveChatWrapper(model);
  const generate = wrapper.generateContextState.bind(wrapper);
  wrapper.generateContextState = options => generate({
    ...options,
    availableFunctions: options.availableFunctions === undefined
      ? functions : options.availableFunctions,
  });
  return wrapper;
}
module.exports = { createToolChatWrapper };
