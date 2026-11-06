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

## Completion candidate 0.1.1

The completion branch adds in-process Quartz and Windows SendInput bindings,
macOS permission controls, and native Intel Mac/Windows ARM64 jobs. Run
`npm run test:computer` to exercise real OCR, pointer focus, Unicode text,
Backspace, button activation and stale-observation rejection in an owned window.
`test:packaged` repeats the fixture using the built executable. Native computer
input dispatch remains an attempt until the target application is observed again.

Run 42246228808 qualified development and packaged computer use on Apple
Silicon, Intel Mac and Windows x64. Windows ARM64 compiled its native binding
but failed to locate the fixture label; it is not yet qualified. Subsequent runs
must resolve fixture visibility/OCR failures rather than bypass their assertions.

The candidate release pipeline requires independently signed builds and actual
upgrade tests for both Mac architectures. It also upgrades the current public
Apple Silicon version into the exact candidate ZIP. Publication combines the
architecture entries only after checking the original signature manifests,
SHA256, SHA512, sizes and retained-data proofs. These additions are not a claim
that 0.1.1 has been signed or published yet.

Microsoft's live identity-validation list on November 6 shows **In Progress**.
The profile still awaits issuer approval. No additional owner document request
was confirmed; the previous profile API error is historical, not evidence that
the live identity request disappeared.

The signed upgrade harness also supports Windows per-user NSIS installation,
actual downloaded installer/relaunch, same-user PID/window/version observations,
and owned uninstallation/cache cleanup. CI wires independent x64 and ARM64
signed upgrade jobs. These paths remain **unqualified until Microsoft issues the
company certificate profile**; no unsigned installer or self-signed substitute
is accepted as evidence. Explicit Restart applies downloaded updates silently
and reopens the app; automatic install-on-quit remains disabled.

Cross-application qualification uses a separate Electron target process, not a
window owned by Companion. Linux real OCR/input and independent teardown pass.
The earlier three-platform input evidence used an in-process fixture; it does
not establish cross-application focus. On Mac, approved computer actions hide
the application as well as its window, then restore it after input.
Windows ARM64 diagnostics confirm an interactive WinSta0/Default console
session; the image's first-boot privacy experience still covers the fixture.
A temporary read-only UI diagnostic is being used to inspect that CI image.

The Windows screen adapter now captures the primary desktop through native GDI
into a copied JavaScript-owned BGRA buffer, then downsizes locally for OCR.
This tests the hypothesis that the ARM runner's Electron thumbnail is stale;
no OS privacy choice or account setting is changed. It still requires the normal
interactive desktop. The temporary UI inspection job was removed after retaining
its result in run 42251526886; new native capture needs actual qualification.

The GDI experiment in 42252130336 returned the same initial setup frame on ARM,
so it did not establish an Electron-thumbnail bug and the experimental adapter
was reverted. The next fixture uses a software renderer on the ARM virtual
runner and permits one observed activation click before requiring field focus.
Both native clicks still require a fresh observation; receiving text and button
activation in the separate process remain mandatory assertions.

The separate-process fixture exposed lost Mac keyboard focus after approval.
The adapter now retains the application PID after the approved click, restores
that application through Accessibility and verifies activation before posting
keys. Initial keyboard input requires clicking the target field first. This
new binding requires native qualification; the earlier in-process pass did not
cover it.

The Mac target now has a distinct fixture bundle identity instead of sharing
Electron's development bundle ID with Companion. Its copied vendor runtime is
ad-hoc signed only for the disposable test target; it is never a release asset.
The production adapter uses NSWorkspace/NSRunningApplication for PID lookup and
activation, followed by an actual foreground-PID check. Accessibility permission
is still required before posting input. Both fixture processes and the copied
bundle remain covered by bounded cleanup.

The hosted ARM image's actual screenshot shows Windows first-run privacy setup.
The fixture can initialize only a disposable GitHub-hosted ARM VM: it recognizes
the inspected 1024×768 privacy page, turns visible optional Yes switches off and
verifies each transition before Next/Accept. It stops on unfamiliar layouts or
failed transitions. It never changes an installed user's OS settings. Native
capture and independent-application input assertions still run afterwards.

Mac input now binds the target PID from the actual clicked window and performs
cooperative activation before hiding Companion. Foreground-PID confirmation
still gates keyboard dispatch. Screen OCR uses sparse-text segmentation and
upsizes small captures, because the ARM first-run Yes/No labels were being
misread before any settings change. The speculative software-renderer workaround
was removed. These changes require the normal native and packaged checks.

Mac access now checks Core Graphics event-posting permission as well as
Accessibility, and the user-requested permission flow requests both through
normal OS APIs. Native tests retain these separate values and real pointer
geometry on failure. The ARM fixture's inspected first page reached all three
No states; its fixed Next button can be used only after both initially enabled
switches have been verified off in that exact first-page layout.
