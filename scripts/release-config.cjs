const {signedConfig} = require("./signing-config.cjs");
const config = signedConfig(process.platform, process.env);
  if (process.env.COMPANION_RELEASE_VERSION) {
    if (!/^\d+\.\d+\.\d+$/.test(process.env.COMPANION_RELEASE_VERSION))
      throw Error("Use a three-part qualification version.");
    config.extraMetadata = { version: process.env.COMPANION_RELEASE_VERSION };
  }
  if (process.env.COMPANION_RELEASE_OUTPUT) {
    if (
      !["dist", "upgrade-target"].includes(process.env.COMPANION_RELEASE_OUTPUT)
    )
      throw Error("Use a task-owned qualification output directory.");
    config.directories = {
      ...config.directories,
      output: process.env.COMPANION_RELEASE_OUTPUT,
    };
  }

module.exports = config;
