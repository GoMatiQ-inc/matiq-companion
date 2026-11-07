# Validation record

Updated November 6, 2026. Qualification applies to the exact source and artifact bytes linked below. The [current public release](https://github.com/GoMatiQ-inc/matiq-companion/releases/latest) is the authoritative record of available installers and architectures; a signing-validation tag is not a public release.

## 0.1.1 implementation and release qualification

The 0.1.1 implementation adds native Quartz and Windows SendInput adapters, Mac permission controls, and four native CI targets: Apple Silicon Mac, Intel Mac, Windows x64 and Windows ARM64. Native functionality is qualified below. Final signed installers require the protected release checks and publication; consult the current release assets for availability.

[Exact-source run 42282079517](https://github.com/GoMatiQ-inc/matiq-companion/actions/runs/42282079517) passed all four native development and packaged suites at `81e8d534465838af6beda99663e8b94205484bc7`. [Post-merge run 42284258080](https://github.com/GoMatiQ-inc/matiq-companion/actions/runs/42284258080) passed all four again at `97ad404799b8d20d9993f1e5c1741ada62c6dd63`; the Git trees match. These runs cover actual inference, GUI chat, document tools, separate-application OCR/native input, five worker model reloads and owned-child/listener teardown. The older failures below are retained history, superseded by these native passes. [Updater UX run 42298592922](https://github.com/GoMatiQ-inc/matiq-companion/actions/runs/42298592922) passes all four complete native suites and 29 unit tests on `ee7709844008bcf21953bdd698b9458478421bdf`, merged as `9878315c2cdbe76acf093f897ba31d853a8ddc12`.

[Final native source run 42305445356](https://github.com/GoMatiQ-inc/matiq-companion/actions/runs/42305445356) passes all four full development/packaged suites and 29 unit tests on `62aa89e28abdcdf7ac16d5583309263da0fe78ef`, merged as `4a5907d3c0f7b2f88fbadd067da21b8ebc6a77d3`. Both commits have complete Git tree `072a5ae024c1432911674c4efbdaea5eb3ea0d15`.

- All 29 unit tests pass, including file boundaries, revocation, document round trips, model integrity, updater state and publication checks.
- [Run 42259539248](https://github.com/GoMatiQ-inc/matiq-companion/actions/runs/42259539248) passes Windows x64 development and packaged cross-application computer use. Mac activation/input and Windows ARM first-run setup failed; those platform attempts failed before the later qualifying runs.
- [Run 42264981228](https://github.com/GoMatiQ-inc/matiq-companion/actions/runs/42264981228) exposed a Mac fixture title/field-label collision and an accessory-window target mismatch. The corrected fixture uses a unique input label; native targeting uses Accessibility hit-testing with a regular-window fallback. The later exact-source runs qualify these corrections.
- Linux bounded Xvfb checks pass actual local inference, model-to-DOCX execution, Electron workflows, OCR and separate-process input. Linux is a development test environment, not a released desktop platform.
- [Voice v0.3.9](https://github.com/GoMatiQ-inc/matiq-voice/releases/tag/v0.3.9) ships the shared-store bridge. [Its qualification run](https://github.com/GoMatiQ-inc/matiq-voice/actions/runs/42251136812) verifies actual speech inference, adoption by another profile, artifact hashes/inodes and offline reuse. Earlier Voice versions do not participate automatically.

The computer fixture requires OCR, native pointer focus, Unicode input, Backspace and a button click in a **separate application process**, plus stale-observation rejection. `test:packaged` repeats this using the actual packaged Companion executable. Earlier in-process fixture passes do not establish cross-application control. Mac input requires both Accessibility and event-posting access; observation requires Screen Recording. Permission requests use normal OS controls, without bypasses.

The Windows ARM hosted image displays first-run privacy setup above test applications. The fixture can initialize only a fresh disposable GitHub-hosted ARM VM: it recognizes the inspected 1024×768 page, disables visible optional Yes switches and checks each transition before continuing. An unfamiliar layout or failed transition stops the test. This preparation never runs on an installed user's computer.

The candidate release pipeline requires independently signed builds and real root-owned PKG upgrades for both Mac architectures, plus an upgrade from the current public Apple Silicon release into the exact candidate ZIP. [Retained-input run 42305582244](https://github.com/GoMatiQ-inc/matiq-companion/actions/runs/42305582244) passes actual root-PKG updates on Apple Silicon and Intel from retained signed 0.1.1 installers to 0.1.2, plus the public Apple Silicon 0.1.0 installer to those candidate 0.1.1 bytes. All three require native administrator authorization, automatic same-user relaunch, all four retained-data checks and independently verified runtime/listener/account cleanup. The temporary administrator originally used a non-login shell; a normal shell corrects GUI authentication without changing OS policy. The native pointer driver runs outside the installed bundle, so older public apps need no new module or production test hook. Those retained app bytes precede the final installing-state fix; [protected qualification 42307226102](https://github.com/GoMatiQ-inc/matiq-companion/actions/runs/42307226102) signs and tests the final exact app bytes for publication. Its success, both architecture proofs and the previous-public-version proof are mandatory publication gates. The first final previous-public attempt sampled the new process before it finished launching and observed a transient root user; the retained diagnostic then shows that same PID running as the normal user. That attempt remains failed. One unchanged signed-input retry is recorded separately; the readiness observer now waits for finished launch and resamples the PID before enforcing the same-user assertion. A finished app running under another user still fails. Windows per-user NSIS upgrade/relaunch and retained-data checks are implemented but remain **unqualified until Microsoft issues the company certificate profile**.

Microsoft's live identity-validation list on November 6 shows **In Progress**. The November 5 Microsoft email requests one company-evidence document and one association/domain-evidence document, PDF or DOCX under 5 MB each. Submission/acceptance cannot be confirmed because the portal detail pane fails to load. The historical certificate-profile API error does not establish that the identity request disappeared. Signing configuration alone is not issuance, and unsigned or self-signed installers cannot satisfy distribution gates.

Development and release CI use Node 24, matching Electron 45.2.3's embedded Node 24.22.2 worker runtime. The earlier Node 22 standalone harness intermittently terminated inside model disposal. Run 42270732872 completed five unmapped and five default mapped Windows x64 lifetimes, so that comparison did not isolate mapping as the cause; production memory mapping remains unchanged. The worker fixture now uses the actual Electron executable, awaits the full tool response, then forces five model unload/reload cycles through the production IPC worker. Packaged qualification repeats it from the ASAR worker. Linux passed actual document creation, complete replies, all five reloads and independent worker cleanup; both exact-source native runs also pass.

The worker now shares one initialization promise between concurrent hardware probing and chat; its real IPC fixture overlaps those requests and requires exactly one native initialization before the document response and five model reloads. Native computer actions restore Companion without taking focus from queued target input. GUI smoke isolates plain chat from the independent Office-tool journey and records visible failure evidence. Fixtures snapshot owned process descendants and listeners before shutdown, verify their absence afterwards and fail if child inspection is unavailable.

Windows release preparation has unit coverage for malformed/wrong-architecture PE headers, altered installer bytes, inconsistent company publishers and attempts to omit a required prior-public-version upgrade proof. The signed pipeline combines platform architecture feeds and the publisher retains both platform feeds once Windows is public. These are implemented gates, **not** evidence of an issued Microsoft profile or a qualified signed Windows release.

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

## Historical Apple Silicon release 0.1.0

[MatiQ Companion v0.1.0](https://github.com/GoMatiQ-inc/matiq-companion/releases/tag/v0.1.0) publishes the signed/notarized Apple Silicon PKG, signed update ZIP, metadata, blockmap and checksums. Binary source: `2a31fe6d3bc0afec6fe641ed5e53713a87c9edcc`.

- [Native CI](https://github.com/GoMatiQ-inc/matiq-companion/actions/runs/42175095673): 24 initial tests, actual verified inference, model-to-DOCX execution, Electron workflows, packaging and packaged inference on Mac ARM and Windows x64.
- [Signed qualification](https://github.com/GoMatiQ-inc/matiq-companion/actions/runs/42175098112): Developer ID app/native/PKG signatures, notarization, stapling, Gatekeeper, extracted ZIP and exact update checksum/size checks.
- The actual Settings check/download/restart flow upgrades a **user-owned ZIP installation** to a separately signed qualification-only version and retains project/settings/generated-file/model hashes. This does not establish root-owned PKG update behavior or native computer control.
- [Publication](https://github.com/GoMatiQ-inc/matiq-companion/actions/runs/42177529259) reuses those exact qualified bytes without rebuilding. Intel Mac and signed Windows are not included in this release.

A previous updater fixture treated an unresolved Promise as readiness and clicked Restart too early; awaited polling and regression tests correct it. Windows inference has also produced a valid response followed by exit 1 during native shutdown in earlier attempts. Failed exit statuses remain failures; controlled reruns and later exact-source results do not erase that history.

## Dependency audit

The current production dependency audit reports two moderate findings in ExcelJS/uuid and no high/critical findings. The installed ExcelJS source imports uuid v4; [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) concerns buffer-based v3/v5/v6 calls. This is a reachability assessment, not removal of flagged packages. The former computer-library/Jimp/file-type chain is now test-only, outside production dependencies. Reassess compatible upstream fixes without forced major-version downgrades.

## Intel signing transport

[Protected run 42284289950](https://github.com/GoMatiQ-inc/matiq-companion/actions/runs/42284289950) retained two Intel Apple ticket-service connection failures (`NSURLErrorDomain -1005`, stapler 68), after successful notarization in the first attempt. Its first Apple Silicon document response exceeded the bounded fixture deadline; the unchanged-source retry passed that journey. No failed status was ignored.

[GitHub runner issue 14924](https://github.com/actions/runner-images/issues/14924) confirms HTTP/3 failures on Intel hosted runners and recommends falling back to TLS/TCP. The CI-only transport helper uses a scoped Apple anchor, a reference-counted PF token and explicit cleanup; it does not replace global firewall rules, disable TLS verification or skip any signature/stapling/Gatekeeper gate. Its real Intel setup/cleanup must pass native CI before protected qualification.

A 1024×768 Windows fixture comparison reproduced the OCR string `GENTRY`; label spacing did not correct it. A separate native comparison maximized the independent test target, removed unrelated desktop text from the controlled test and passed strict label recognition plus real input/readback. The fixture now fills its work area and records the actual observation frame on failure. This changes the fixture layout, not the application's OCR matching or native input path.

Native publication proof is bound to the complete Git tree and all four successful named architecture jobs in trusted main history. The real merged run 42288354690 qualifies signed source `dd2cad06d1a4311a9076f1dfac88d00c93d8dc65` because both have tree `68e6511e523f5a611a3d285c6fd188e88a0f3d85`. Regression tests reject changed or unmerged files, forked/failed runs, missing platforms and diagnostic-only jobs.

## Mac mini acceptance follow-up

The installed signed 0.1.2 app completed native screen OCR after normal OS grants, but its 18,000-character tool-result prefix overflowed the 4,096-token local model context. The candidate now serializes results against the actual loaded model tokenizer with a 1,024-token result budget. Oversized screen results retain complete text/coordinate triples and explicitly report omitted content; other oversized results carry a labelled excerpt rather than silently cut JSON. Unit checks cover bounds and retained coordinates. The actual Electron worker fixture also requests a large synthetic OCR result and requires a completed worker turn before the existing model lifetime checks. Native qualification and final installed-app acceptance of this candidate remain pending.

The same installed-app acceptance observed that denied native capture prevented the Screen Recording request button from opening System Settings. The candidate opens the normal settings pane even when capture rejects and then reports the capture error with the actual host app name and restart instructions. Focused unit checks cover denial and success; they do not claim an OS grant.

The first 0.1.3 signed run failed in the new read-only OCR regression because its small model requested an unrelated offered input tool. The fixture now offers only observation and includes the requested target label in the oversized synthetic result. It still requires actual observation invocation, full production result budgeting and worker completion. The separate native computer fixture continues to require real clicks, text and key input; those checks are unchanged.
