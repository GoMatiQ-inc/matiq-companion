const path = require("node:path");
const { signedConfig } = require("./signing-config.cjs");
const { withMacKeychain } = require("./mac-keychain.cjs");
async function main() {
  const config = signedConfig(process.platform, process.env);
  const operation = () =>
    require("electron-builder").build({
      projectDir: path.join(__dirname, ".."),
      config,
      publish: "never",
    });
  if (process.platform === "darwin")
    await withMacKeychain(process.env, operation);
  else await operation();
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
