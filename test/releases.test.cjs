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

test("complete signing config loads without merging duplicate feed or installer targets", () => {
  const { spawnSync } = require("node:child_process");
  const path = require("node:path");
  const source = `Object.defineProperty(process,'platform',{value:'darwin'});Object.assign(process.env,{CSC_NAME:'Developer ID Application: Fixture',CSC_INSTALLER_NAME:'Developer ID Installer: Fixture',APPLE_ID:'fixture@example.test',APPLE_APP_SPECIFIC_PASSWORD:'fixture',APPLE_TEAM_ID:'TESTTEAM01'});const assert=require('node:assert/strict');const {getConfig,validateConfiguration}=require('app-builder-lib/out/util/config/config');const {DebugLogger}=require('builder-util');(async()=>{const merged=await getConfig(process.cwd(),require('node:path').resolve('scripts/release-config.cjs'),null);assert.deepEqual(merged.publish,[{provider:'github',owner:'GoMatiQ-inc',repo:'matiq-companion'}]);assert.deepEqual(merged.mac.target,['pkg','zip']);await validateConfiguration(merged,new DebugLogger());})().catch(error=>{console.error(error.message);process.exit(1);});`;
  const child = spawnSync(process.execPath, ["-e", source], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
    timeout: 15000,
  });
  assert.equal(child.status, 0, child.stderr || child.error?.message);
});
