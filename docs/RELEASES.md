# Installers, releases and updates

Development packages are macOS DMG/ZIP and Windows NSIS. Signed Mac distribution uses a Developer ID Installer PKG plus the signed application ZIP, matching the proven MatiQ Voice signing path. The ZIP and latest-mac.yml are required for in-app Mac updates; Windows needs the NSIS installer, blockmap and latest.yml. Keep each release's verified assets together.

Settings provides check → download → restart. Background download and install-on-quit are disabled. Restart is blocked during a chat/model download. Projects and models are outside the application bundle; uninstall preserves application data.

## Shared company signing

Companion reuses the company Developer ID Application and Installer certificates and notarization account used by Voice. Its bundle ID remains `com.matiq.companion` and its GitHub feed remains `GoMatiQ-inc/matiq-companion`. Signing identity reuse does not merge applications or data. No new certificate or developer subscription is needed per app.

The tag-restricted `release-signing` environment uses the existing names `CSC_LINK`, `CSC_KEY_PASSWORD`, `CSC_NAME`, `CSC_INSTALLER_LINK`, `CSC_INSTALLER_KEY_PASSWORD`, `CSC_INSTALLER_NAME`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`. Secrets are scoped to signing steps; package installation and model tests do not receive them. Native signing uses a temporary keychain and restores/removes it in finally cleanup. Keychain CLI passwords go through standard input rather than process arguments.

Windows reuses the existing Azure signer with a separate GitHub OIDC trust for this repository/environment. Its configuration uses `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `MATIQ_AZURE_SIGN_ENDPOINT`, `MATIQ_AZURE_SIGN_ACCOUNT`, `MATIQ_AZURE_SIGN_PROFILE` and the actual verified `MATIQ_WINDOWS_PUBLISHER`. A missing/unapproved Microsoft certificate profile is an external issuance blocker; do not substitute a self-signed certificate or a guessed publisher.

## Validation and publication

Use a `v<package-version>-signing.<n>` tag pointing to source merged into main, then dispatch Prepare signed release with platform mac/windows/both. This validates without publication. The environment permits version tags only. A normal matching stable tag qualifies both platforms and creates an empty draft; the verified publisher fills it with checked assets before publication.

Qualification must include unit/security tests, actual model inference/tool use, packaged runtime, Developer ID/native signatures, notarization, stapling, Gatekeeper, extracted update ZIP verification and exact YAML checksum/size validation. Windows requires matching publisher, native Authenticode and timestamp verification. Signing checks fail visibly.

Before publishing updates, qualify a real signed two-version download/restart and confirm projects/models survive. Native computer capture/input still requires supported-OS privacy-permission qualification. Do not confuse a green unsigned build or a signing credential being configured with a verified signed update.

Node-API libraries ship from the platform installation with `npmRebuild: false`. Native CI launches the packaged app to catch ASAR/library discovery failures. Development Mac builds use an ad-hoc signature; release builds require Developer ID.

The Mac signing job also builds a signed next-patch qualification version, validates both artifact sets, then runs a test-owned loopback update feed. The test uses the actual Settings check/download/restart controls and requires an automatically relaunched newer process plus unchanged project, settings, generated-file and model hashes. Qualification target artifacts remain separate from published base assets. Both apps and the fixture listener have finite watchdogs and independent process/port cleanup checks. The restart observer uses the actual macOS launched bundle, installed version and a new same-user PID. It uses unchanged default data paths only on a disposable GitHub-hosted VM and refuses to touch any pre-existing profile/model store; it requires no production test hook. Native updater diagnostics are retained on failure.

`Publish verified desktop installers` can publish the Mac platform independently while Microsoft issuance is unavailable and Windows has no public installer. It accepts only a successful trusted signed run, requires exact-source native CI and real upgrade-preservation proof, and checks every asset against the signature report before publishing. It reuses the tested bytes; it does not rebuild or resign during publication.

Mac signing retains the verified base and newer target as separate artifacts. A dependent native upgrade job downloads those exact artifacts and emits proof tied to the base ZIP SHA256. Rerun only the failed upgrade job when diagnosing native updater behavior; never rebuild or replace its signed inputs during a retry. Publication requires both jobs to succeed in the same trusted workflow. Native stdout/stderr and process state are captured before cleanup.

## Multi-architecture Mac qualification

For 0.1.1 and later, the signing workflow uses Apple Silicon and Intel runners.
Each artifact keeps its architecture in the filename. Each runner qualifies an
actual signed download/restart, and a separate Apple Silicon job upgrades the
current public release into the candidate bytes. The publisher requires all
three proofs, verifies both original signature manifests, and creates one update
feed containing both verified ZIP entries. Never merge artifact directories with
identically named manifests or metadata before checking their contents.

System-installed qualification uses the actual signed PKG under `/Applications`
on a fresh disposable Mac CI VM and launches it as the normal user. Publication
requires this proof on both architectures and for the previous public release
upgrade. The harness refuses existing app/profile/receipt state, limits process
cleanup to the owned bundle/cache, and removes only its installed app and receipt.
A user-owned ZIP upgrade alone does not establish system-PKG update behavior. The Mac fixture creates a temporary normal administrator only inside a disposable hosted job, verifies its generated password and wrong-password rejection, and submits the exact Companion Add Helper dialog through a test-owned native pointer driver. It never changes authorization/privacy policy or a human account. Credentials stay in memory/stdin, outside logs, argv and files; finally cleanup verifies account/home removal. The driver runs outside the installed bundle so previous public app versions need no new module or production test hook. Publication requires the native-authorization proof as well as actual replacement, relaunch and retained data.

The native upgrade jobs use the combined Apple Silicon/Intel feed and verify the replacement executable architecture with `lipo`. The previous-public-version proof records the combined feed SHA256; publication must reproduce that exact feed from the qualified artifact metadata. A single-architecture feed test is insufficient for the two-architecture release.

## Windows publication and shared release feeds

After Microsoft issues the company profile, dispatch signing with `both` and publish with `include_windows: true`. The verified publisher combines x64/ARM64 NSIS entries only after validating trusted Windows signature manifests, the issued publisher, all artifact hashes and actual per-user download/restart preservation proofs. Signed app and replaced-executable PE headers must match their native architecture. A public Windows installer already present for an architecture requires an actual previous-public-version upgrade proof; first-release absence is recorded explicitly, not represented as a migration pass.

Mac and Windows share one GitHub release stream. After a public release contains Windows installers, publication must include both Windows architectures with the Mac artifacts; publishing a Mac-only latest release would leave Windows clients without `latest.yml`. Both platform feeds and the combined checksum file publish from verified bytes without rebuilding. An existing empty draft can be populated; public or partially uploaded releases are not overwritten automatically. Draft creation never merges architecture folders with colliding manifests or feeds.

Intel GitHub-hosted jobs use the scoped `ci-notary-transport.py` setup/cleanup around Apple ticket requests because of [runner-images issue 14924](https://github.com/actions/runner-images/issues/14924). The helper blocks only UDP/443 in an owned anchor so TLS/TCP remains available, requires the standard Apple parent anchor and preserves the original root rules and enablement state. Native CI qualifies setup and teardown; release jobs always perform cleanup. Missing ownership, unexpected rules or cleanup failures stop qualification. Never apply this helper to a user machine or persistent runner.

Publication accepts native CI on the signing commit or a main-history commit with the identical **complete Git tree**. It requires the trusted repository and all four named native architecture jobs to succeed. The tree includes workflows, tests, lockfile and application code; different trees, diagnostic-only jobs and failed runs do not qualify. Release notes record the native run, tested commit/tree and actual signed-source commit, so an ordinary merge can reuse its completed source qualification.
