# Validation record

Initial implementation, November 5, 2026. These checks establish a working prototype; they do not establish a signed public release.

## Reproducible checks

- `npm test`: file-grant boundaries, symlink/junction rejection, revocation during approval, disabled/denied actions, protected application state, original-file backup, non-overwriting moves, real DOCX/XLSX round trips, model checksum/deduplication, DNS pinning/private redirects, manual updater transitions and release-signing configuration gates.
- `COMPANION_VALIDATION_MODELS=/isolated/test/store npm run test:inference`: download official Qwen3 0.6B, verify exact bytes/hash and run actual native inference.
- With that same isolated model store, `npm run test:tools`: real model calls approved create_word; read back actual generated DOCX content.
- `npm run test:desktop`: real Electron navigation, persisted project permissions and model setup. Supplying the isolated model store also exercises real inference through the Electron worker and renderer. Linux uses `timeout 105 xvfb-run -a npm run test:desktop`.
- `npm run test:computer`: actual primary-screen OCR and native typing into an owned disposable window. Linux Xvfb fixture passed; macOS/Windows screen/privacy and native input are still pending qualification. The app returns an input-attempt receipt, not proof of target success.

Linux unit tests, actual local inference, actual model-to-DOCX tool execution, Electron workflow and computer fixture passed. A live approved public-search module check returned five genuine results. Native CI results are linked in the GitHub Actions history; consult the exact commit, not an older green build.

## Signed Mac release — November 6, 2026

[MatiQ Companion v0.1.0](https://github.com/GoMatiQ-inc/matiq-companion/releases/tag/v0.1.0) publishes the qualified Apple Silicon Mac PKG, update ZIP/metadata/blockmap and SHA256SUMS. Qualified binary source: `2a31fe6d3bc0afec6fe641ed5e53713a87c9edcc`.

- [Exact-source native CI](https://github.com/GoMatiQ-inc/matiq-companion/actions/runs/42175095673) passes on macOS and Windows: all 24 tests, actual verified model inference, model-to-DOCX tool execution, Electron workflows, installer packaging and packaged inference. Update actions are checked for unavailable-state disabling.
- [Signed build and actual upgrade](https://github.com/GoMatiQ-inc/matiq-companion/actions/runs/42175098112) pass: Developer ID app/native signatures and PKG signature, notarization, stapling, Gatekeeper, extracted ZIP verification, bundle identity/version and exact update-metadata bytes.
- The actual Settings check/download/restart flow installed the separately signed qualification target 0.1.1, observed a new same-user macOS finished-launching process and preserved project/settings/generated-file/model hashes. Qualification target 0.1.1 is not published. The proof covers base ZIP SHA256 `5cc96ad58cfd35764ee5023ae9bc5540c670f136a9e0cf8bca65e2c50d539dec`.
- The native restart test uses the signed ZIP in a user-owned app location and unchanged default data paths on a disposable CI VM. It does not automate administrator prompts for PKG installation into /Applications. Owned processes and captured inspector/fixture listeners are independently checked absent after cleanup.
- [Publication CI](https://github.com/GoMatiQ-inc/matiq-companion/actions/runs/42177529259) reused the qualified bytes and verified every downloadable asset against its signature manifest. Build diagnostics are excluded from release assets.

An earlier test clicked Restart before the ZIP completed: its async Playwright predicate was treated as ready, while the backend correctly rejected the request. Awaited polling, state-gated UI actions and immediate pending-download state fix that defect; regression tests cover it. An older Windows native attempt produced a valid response then exited 1 during shutdown and passed a controlled rerun; the current exact-source run passes without a retry. No exit status or failed qualification was ignored.

## Remaining qualification

- Signed Windows distribution needs Microsoft's valid company identity-validation record, resulting certificate profile and verified publisher. The existing account currently has no certificate profile; creation was rejected because identity-validation details were not found. Signing infrastructure is configured, but issuance is not being claimed complete.
- Qualify screen capture/input on the actual supported operating systems with their privacy permissions.
- Ship the separate Voice model-store bridge before claiming existing Voice installations share the directory.
- Intel Mac and Windows ARM builds are not qualified by this initial release.

## Dependency audit

The initial production dependency audit reports nine moderate findings through two transitive dependency chains and no high/critical findings. ExcelJS uses only uuid v4, whereas [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) concerns buffer-based v3/v5/v6. The computer-input library includes Jimp/file-type, with [GHSA-5v7r-6r5c-r473](https://github.com/advisories/GHSA-5v7r-6r5c-r473) affecting malformed ASF detection. Companion does not expose Jimp image-file decoding or file-type detection to tools; its OCR accepts screen PNG bytes. This is a reachability assessment, not removal of the flagged packages. Reassess/pin compatible upstream fixes before broader computer-use expansion. Do not run forced major-version audit fixes without native regression checks.
