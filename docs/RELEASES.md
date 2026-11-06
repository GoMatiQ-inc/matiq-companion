# Installers, releases and updates

Development packages are macOS DMG/ZIP and Windows NSIS. Signed Mac distribution uses a Developer ID Installer PKG plus the signed application ZIP, matching the proven MatiQ Voice signing path. The ZIP and latest-mac.yml are required for in-app Mac updates; Windows needs the NSIS installer, blockmap and latest.yml. Keep each release's verified assets together.

Settings provides check → download → restart. Background download and install-on-quit are disabled. Restart is blocked during a chat/model download. Projects and models are outside the application bundle; uninstall preserves application data.

## Shared company signing

Companion reuses the company Developer ID Application and Installer certificates and notarization account used by Voice. Its bundle ID remains `com.matiq.companion` and its GitHub feed remains `GoMatiQ-inc/matiq-companion`. Signing identity reuse does not merge applications or data. No new certificate or developer subscription is needed per app.

The tag-restricted `release-signing` environment uses the existing names `CSC_LINK`, `CSC_KEY_PASSWORD`, `CSC_NAME`, `CSC_INSTALLER_LINK`, `CSC_INSTALLER_KEY_PASSWORD`, `CSC_INSTALLER_NAME`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`. Secrets are scoped to signing steps; package installation and model tests do not receive them. Native signing uses a temporary keychain and restores/removes it in finally cleanup. Keychain CLI passwords go through standard input rather than process arguments.

Windows reuses the existing Azure signer with a separate GitHub OIDC trust for this repository/environment. Its configuration uses `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `MATIQ_AZURE_SIGN_ENDPOINT`, `MATIQ_AZURE_SIGN_ACCOUNT`, `MATIQ_AZURE_SIGN_PROFILE` and the actual verified `MATIQ_WINDOWS_PUBLISHER`. A missing/unapproved Microsoft certificate profile is an external issuance blocker; do not substitute a self-signed certificate or a guessed publisher.

## Validation and publication

Use a `v<package-version>-signing.<n>` tag pointing to source merged into main, then dispatch Prepare signed release with platform mac/windows/both. This validates without publication. The environment permits version tags only. A normal matching stable tag builds both platforms into a draft; it does not silently publish.

Qualification must include unit/security tests, actual model inference/tool use, packaged runtime, Developer ID/native signatures, notarization, stapling, Gatekeeper, extracted update ZIP verification and exact YAML checksum/size validation. Windows requires matching publisher, native Authenticode and timestamp verification. Signing checks fail visibly.

Before publishing updates, qualify a real signed two-version download/restart and confirm projects/models survive. Native computer capture/input still requires supported-OS privacy-permission qualification. Do not confuse a green unsigned build or a signing credential being configured with a verified signed update.

Node-API libraries ship from the platform installation with `npmRebuild: false`. Native CI launches the packaged app to catch ASAR/library discovery failures. Development Mac builds use an ad-hoc signature; release builds require Developer ID.

The Mac signing job also builds a signed next-patch qualification version, validates both artifact sets, then runs a test-owned loopback update feed. The test uses the actual Settings check/download/restart controls and requires an automatically relaunched newer process plus unchanged project, settings, generated-file and model hashes. Qualification target artifacts remain separate from published base assets. Both apps and the fixture listener have finite watchdogs and independent process/port cleanup checks. The restart observer uses the actual macOS launched bundle, installed version and a new same-user PID. It uses unchanged default data paths only on a disposable GitHub-hosted VM and refuses to touch any pre-existing profile/model store; it requires no production test hook. Native updater diagnostics are retained on failure.

`Publish verified Mac installer` can publish the Mac platform independently while Microsoft issuance is unavailable. It accepts only a successful trusted signed run, requires exact-source native CI and real upgrade-preservation proof, and checks every asset against the signature report before publishing. It reuses the tested bytes; it does not rebuild or resign during publication.

Mac signing retains the verified base and newer target as separate artifacts. A dependent native upgrade job downloads those exact artifacts and emits proof tied to the base ZIP SHA256. Rerun only the failed upgrade job when diagnosing native updater behavior; never rebuild or replace its signed inputs during a retry. Publication requires both jobs to succeed in the same trusted workflow. Native stdout/stderr and process state are captured before cleanup.

## Multi-architecture Mac qualification

For 0.1.1 and later, the signing workflow uses Apple Silicon and Intel runners.
Each artifact keeps its architecture in the filename. Each runner qualifies an
actual signed download/restart, and a separate Apple Silicon job upgrades the
current public release into the candidate bytes. The publisher requires all
three proofs, verifies both original signature manifests, and creates one update
feed containing both verified ZIP entries. Never merge artifact directories with
identically named manifests or metadata before checking their contents.
