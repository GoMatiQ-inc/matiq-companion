const test = require("node:test");
const assert = require("node:assert/strict");
const { signedConfig } = require("../scripts/signing-config.cjs");
test("release signing fails closed without distribution identities and notarization", () => {
  assert.throws(() => signedConfig("linux", {}), /native/);
  assert.throws(() => signedConfig("darwin", {}), /Developer ID/);
  assert.throws(
    () =>
      signedConfig("darwin", {
        CSC_NAME: "Developer ID Application: Test",
        CSC_INSTALLER_NAME: "Developer ID Installer: Test",
      }),
    /notarization/,
  );
  assert.throws(() => signedConfig("win32", {}), /verified Windows/);
});
test("Azure signing accepts only complete official profile configuration", () => {
  const env = {
    MATIQ_WINDOWS_PUBLISHER: "Test Publisher",
    AZURE_CLIENT_ID: "test-client",
    AZURE_TENANT_ID: "test-tenant",
    MATIQ_AZURE_SIGN_ENDPOINT: "https://eus.codesigning.azure.net/",
    MATIQ_AZURE_SIGN_ACCOUNT: "test-account",
    MATIQ_AZURE_SIGN_PROFILE: "test-profile",
  };
  assert.throws(
    () => signedConfig("win32", { ...env, MATIQ_AZURE_SIGN_PROFILE: "" }),
    /OIDC/,
  );
  assert.throws(
    () =>
      signedConfig("win32", {
        ...env,
        MATIQ_AZURE_SIGN_ENDPOINT: "https://example.invalid/",
      }),
    /official/,
  );
  const config = signedConfig("win32", env);
  assert.equal(config.forceCodeSigning, true);
  assert.equal(config.win.verifyUpdateCodeSignature, true);
  assert.equal(config.win.azureSignOptions.publisherName, "Test Publisher");
  assert.equal(config.win.signtoolOptions, undefined);
});
