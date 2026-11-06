const { build } = require("../package.json");
function signedConfig(platform, env) {
  const result = { ...build, forceCodeSigning: true };
  if (platform === "darwin") {
    if (
      !env.CSC_NAME?.startsWith("Developer ID Application:") ||
      !env.CSC_INSTALLER_NAME?.startsWith("Developer ID Installer:")
    )
      throw Error(
        "Configure the existing Developer ID Application and Installer identities.",
      );
    if (!env.APPLE_ID || !env.APPLE_APP_SPECIFIC_PASSWORD || !env.APPLE_TEAM_ID)
      throw Error(
        "Configure Apple notarization credentials before publishing an update.",
      );
    result.mac = {
      ...build.mac,
      target: ["pkg", "zip"],
      identity: env.CSC_NAME.slice("Developer ID Application:".length).trim(),
      notarize: true,
    };
    result.pkg = {
      identity: env.CSC_INSTALLER_NAME.slice(
        "Developer ID Installer:".length,
      ).trim(),
      installLocation: "/Applications",
      allowAnywhere: false,
      allowCurrentUserHome: false,
      allowRootDirectory: true,
      isRelocatable: false,
    };
  } else if (platform === "win32") {
    if (!env.MATIQ_WINDOWS_PUBLISHER)
      throw Error(
        "Configure the verified Windows certificate publisher after Microsoft approves company validation.",
      );
    const azure = [
      "MATIQ_AZURE_SIGN_ENDPOINT",
      "MATIQ_AZURE_SIGN_ACCOUNT",
      "MATIQ_AZURE_SIGN_PROFILE",
    ];
    result.win = {
      ...build.win,
      signExts: [".dll", ".node"],
      verifyUpdateCodeSignature: true,
      signtoolOptions: { publisherName: env.MATIQ_WINDOWS_PUBLISHER },
    };
    if (azure.some((name) => env[name])) {
      if (
        !azure.every((name) => env[name]) ||
        !env.AZURE_CLIENT_ID ||
        !env.AZURE_TENANT_ID
      )
        throw Error(
          "Configure the existing Azure signing profile and OIDC identity.",
        );
      if (
        !/^https:\/\/[a-z0-9]+\.codesigning\.azure\.net\/?$/.test(
          env.MATIQ_AZURE_SIGN_ENDPOINT,
        )
      )
        throw Error("Use the official regional Azure signing HTTPS endpoint.");
      result.win.azureSignOptions = {
        endpoint: env.MATIQ_AZURE_SIGN_ENDPOINT,
        codeSigningAccountName: env.MATIQ_AZURE_SIGN_ACCOUNT,
        certificateProfileName: env.MATIQ_AZURE_SIGN_PROFILE,
        publisherName: env.MATIQ_WINDOWS_PUBLISHER,
      };
      delete result.win.signtoolOptions;
    } else if (!env.CSC_LINK || !env.CSC_KEY_PASSWORD)
      throw Error(
        "Configure a trusted Windows certificate or the existing Azure signer.",
      );
  } else throw Error("Build public releases on native macOS or Windows.");
  return result;
}
module.exports = { signedConfig };
