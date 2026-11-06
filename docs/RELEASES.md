# Installers, releases and updates

`npm run package` builds a macOS DMG plus ZIP or a Windows NSIS installer. The ZIP and update metadata are required by the macOS updater; Windows needs the NSIS installer, blockmap and latest YAML. Release assets must remain together on the matching versioned GitHub release. Replacing a model does not require an app update.

Updates are user initiated: Settings → check → download → restart to update. Automatic background downloads and automatic install-on-quit are disabled. Restart is blocked while a chat or model download is active. Development checkouts report that updates are unavailable. Projects and models are stored outside the installed app, and Windows uninstall preserves application data by default.

## Qualification before publishing

1. Pass unit tests, real inference, renderer/IPC and package checks on each supported native platform/architecture. Test macOS Apple Silicon and Windows x64 first; Intel Mac/Windows ARM are not yet qualified.
2. Configure dedicated code-signing credentials through the repository's protected `release` environment. macOS requires Developer ID signing and notarization; Windows requires a trusted code-signing identity. No credentials are committed or copied from another app.
3. Publish a signed prerelease, install it on clean native machines, then publish the next signed prerelease and verify check/download/restart plus project/model preservation. Check tampered/untrusted assets fail and interrupted downloads recover visibly.
4. Promote only after that real two-version upgrade succeeds. Unit tests of updater events do not prove installer trust or OS integration.

The `checks` workflow builds unsigned/ad-hoc development installer artifacts for review. It never publishes releases or enables unattended user upgrades. The repository currently has no configured signing secrets; public update release publication remains a qualification gate. Do not mark a source commit as a shipped update.

## Release automation

A version-matching `v*` tag runs the signed release workflow. Both native jobs must pass and signing/notarization configuration must be present before assets are assembled into a **draft** GitHub release. Publishing that qualified draft makes the update discoverable to installed clients. Ordinary source pushes run development checks; they do not force unfinished code onto users.

The protected `release` environment uses `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `MAC_CSC_NAME`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`. These are dedicated distribution identities, not user login credentials. Never commit them or include values in logs. Windows signing must match the configured publisher name.

Native Node-API dependencies are shipped from their verified platform installations; `npmRebuild: false` avoids rebuilding the llama runtime for an Electron ABI it does not require. Each native CI build must launch the packaged application and complete actual local inference before upload, so missing native libraries or broken ASAR paths fail the job. macOS development builds use an ad-hoc signature; release builds override it with the required Developer ID identity.
