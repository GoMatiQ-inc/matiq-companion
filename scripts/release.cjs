const {withNotaryProfile} = require("@matiq-solutions/sdk/notary-profile.cjs");
const path = require("node:path");
const { withMacKeychain } = require("./mac-keychain.cjs");
async function main() {
  require("./release-config.cjs");
  const operation = () =>
    require("electron-builder").build({
      projectDir: path.join(__dirname, ".."),
      config: path.join(__dirname, "release-config.cjs"),
      publish: "never",
    });
  if (process.platform === "darwin")
    await withMacKeychain(process.env, () => withNotaryProfile(process.env, operation));
  else await operation();
}
main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
