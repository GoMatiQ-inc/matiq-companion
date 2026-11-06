const { build } = require("../package.json");
function signedConfig(platform, env) {
  const result = { ...build, forceCodeSigning: true };
  if (platform === "darwin") {
    if (
      !env.CSC_LINK ||
      !env.CSC_KEY_PASSWORD ||
      !env.CSC_NAME?.startsWith("Developer ID Application:")
    )
      throw Error(
        "Configure a Developer ID Application certificate, password and identity in the release environment.",
      );
    if (!env.APPLE_ID || !env.APPLE_APP_SPECIFIC_PASSWORD || !env.APPLE_TEAM_ID)
      throw Error(
        "Configure Apple notarization credentials before publishing an update.",
      );
    result.mac = {
      ...build.mac,
      identity: env.CSC_NAME.slice("Developer ID Application:".length).trim(),
      notarize: true,
    };
  } else if (platform === "win32") {
    if (!env.CSC_LINK || !env.CSC_KEY_PASSWORD)
      throw Error(
        "Configure the trusted Windows code-signing certificate and password in the release environment.",
      );
    result.win = { ...build.win, signExts: [".dll", ".node"] };
  } else throw Error("Build public releases on native macOS or Windows.");
  return result;
}
module.exports = signedConfig(process.platform, process.env);
