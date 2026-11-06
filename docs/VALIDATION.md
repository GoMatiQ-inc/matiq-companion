# Validation record

Updated November 6, 2026. Qualification applies to the exact source and artifact bytes linked below.

## Completion candidate 0.1.1

The candidate adds native Quartz and Windows SendInput adapters, Mac permission controls, and four native CI targets: Apple Silicon Mac, Intel Mac, Windows x64 and Windows ARM64. It has **not** been signed or published as a completed release.

- All 25 unit tests pass, including file boundaries, revocation, document round trips, model integrity, updater state and publication checks.
- [Run 42259539248](https://github.com/GoMatiQ-inc/matiq-companion/actions/runs/42259539248) passes Windows x64 development and packaged cross-application computer use. Mac activation/input and Windows ARM first-run setup failed; those platforms remain unqualified for computer use.
- [Run 42263806947](https://github.com/GoMatiQ-inc/matiq-companion/actions/runs/42263806947) checks the subsequent permission diagnostics and ARM setup correction. Consult its actual conclusions before claiming support.
- Linux bounded Xvfb checks pass actual local inference, model-to-DOCX execution, Electron workflows, OCR and separate-process input. Linux is a development test environment, not a released desktop platform.
- [Voice v0.3.9](https://github.com/GoMatiQ-inc/matiq-voice/releases/tag/v0.3.9) ships the shared-store bridge. [Its qualification run](https://github.com/GoMatiQ-inc/matiq-voice/actions/runs/42251136812) verifies actual speech inference, adoption by another profile, artifact hashes/inodes and offline reuse. Earlier Voice versions do not participate automatically.

The computer fixture requires OCR, native pointer focus, Unicode input, Backspace and a button click in a **separate application process**, plus stale-observation rejection. `test:packaged` repeats this using the actual packaged Companion executable. Earlier in-process fixture passes do not establish cross-application control. Mac input requires both Accessibility and event-posting access; observation requires Screen Recording. Permission requests use normal OS controls, without bypasses.

The Windows ARM hosted image displays first-run privacy setup above test applications. The fixture can initialize only a fresh disposable GitHub-hosted ARM VM: it recognizes the inspected 1024×768 page, disables visible optional Yes switches and checks each transition before continuing. An unfamiliar layout or failed transition stops the test. This preparation never runs on an installed user's computer.

The candidate release pipeline requires independently signed builds and real root-owned PKG upgrades for both Mac architectures, plus an upgrade from the current public Apple Silicon release into the exact candidate ZIP. These new system-installed update paths are **not yet qualified**. Windows per-user NSIS upgrade/relaunch and retained-data checks are implemented but remain **unqualified until Microsoft issues the company certificate profile**.

Microsoft's live identity-validation list on November 6 shows **In Progress**. No new owner document request was confirmed. The historical certificate-profile API error does not establish that the identity request disappeared. Signing configuration alone is not issuance, and unsigned or self-signed installers cannot satisfy distribution gates.

## Reproduce the checks

Use an isolated `COMPANION_VALIDATION_MODELS` directory, never a live user's profile or model store.

- `npm test`: security, persistence, models, updater transitions and release gates.
- `npm run test:inference`: download and hash-check the official smallest Qwen model, then run actual native inference.
- `npm run test:tools`: real model-to-approved-tool execution and generated DOCX readback.
- `npm run test:desktop`: Electron navigation, persisted permissions and actual inference through the worker/renderer.
- `npm run test:computer`: actual OCR and native input into an independent owned application. macOS requires normal privacy access.
- `npm run test:packaged`: desktop and computer checks against the packaged executable.
- `npm run test:upgrade`: real signed two-version install/download/restart, default-profile data preservation and independent process/port cleanup on a fresh disposable native CI VM.

The fixture processes and listeners have finite watchdogs, owned-child identification and independent teardown checks. Computer actions return an input-attempt receipt; users must observe again to establish the target outcome.

## Published Apple Silicon release 0.1.0

[MatiQ Companion v0.1.0](https://github.com/GoMatiQ-inc/matiq-companion/releases/tag/v0.1.0) publishes the signed/notarized Apple Silicon PKG, signed update ZIP, metadata, blockmap and checksums. Binary source: `2a31fe6d3bc0afec6fe641ed5e53713a87c9edcc`.

- [Native CI](https://github.com/GoMatiQ-inc/matiq-companion/actions/runs/42175095673): 24 initial tests, actual verified inference, model-to-DOCX execution, Electron workflows, packaging and packaged inference on Mac ARM and Windows x64.
- [Signed qualification](https://github.com/GoMatiQ-inc/matiq-companion/actions/runs/42175098112): Developer ID app/native/PKG signatures, notarization, stapling, Gatekeeper, extracted ZIP and exact update checksum/size checks.
- The actual Settings check/download/restart flow upgrades a **user-owned ZIP installation** to a separately signed qualification-only version and retains project/settings/generated-file/model hashes. This does not establish root-owned PKG update behavior or native computer control.
- [Publication](https://github.com/GoMatiQ-inc/matiq-companion/actions/runs/42177529259) reuses those exact qualified bytes without rebuilding. Intel Mac and signed Windows are not included in this release.

A previous updater fixture treated an unresolved Promise as readiness and clicked Restart too early; awaited polling and regression tests correct it. Windows inference has also produced a valid response followed by exit 1 during native shutdown in earlier attempts. Failed exit statuses remain failures; controlled reruns and later exact-source results do not erase that history.

## Dependency audit

The initial production dependency audit reports nine moderate findings through two transitive dependency chains and no high/critical findings. ExcelJS uses only uuid v4, whereas [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) concerns buffer-based v3/v5/v6. The computer-input library includes Jimp/file-type, with [GHSA-5v7r-6r5c-r473](https://github.com/advisories/GHSA-5v7r-6r5c-r473) affecting malformed ASF detection. Companion does not expose Jimp image-file decoding or file-type detection to tools; its OCR accepts screen PNG bytes. This is a reachability assessment, not removal of the flagged packages. Reassess/pin compatible upstream fixes before broader computer-use expansion. Do not run forced major-version audit fixes without native regression checks.
