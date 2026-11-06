# Validation record

Initial implementation, November 5, 2026. These checks establish a working prototype; they do not establish a signed public release.

## Reproducible checks

- `npm test`: file-grant boundaries, symlink/junction rejection, revocation during approval, disabled/denied actions, protected application state, original-file backup, non-overwriting moves, real DOCX/XLSX round trips, model checksum/deduplication, DNS pinning/private redirects, manual updater transitions and release-signing configuration gates.
- `COMPANION_VALIDATION_MODELS=/isolated/test/store npm run test:inference`: download official Qwen3 0.6B, verify exact bytes/hash and run actual native inference.
- With that same isolated model store, `npm run test:tools`: real model calls approved create_word; read back actual generated DOCX content.
- `npm run test:desktop`: real Electron navigation, persisted project permissions and model setup. Supplying the isolated model store also exercises real inference through the Electron worker and renderer. Linux uses `timeout 105 xvfb-run -a npm run test:desktop`.
- `npm run test:computer`: actual primary-screen OCR and native typing into an owned disposable window. Linux Xvfb fixture passed; macOS/Windows screen/privacy and native input are still pending qualification. The app returns an input-attempt receipt, not proof of target success.

Linux unit tests, actual local inference, actual model-to-DOCX tool execution, Electron workflow and computer fixture passed. A live approved public-search module check returned five genuine results. Native CI results are linked in the GitHub Actions history; consult the exact commit, not an older green build.

## Public release gates

- Finish native installer and packaged-runtime smoke qualification on Apple Silicon and Windows x64.
- Configure distribution signing/notarization credentials; test a real two-version signed update preserving projects and models. No signed public release has been issued.
- Qualify screen capture/input on the actual supported operating systems with their privacy permissions.
- Ship the separate Voice model-store bridge before claiming existing Voice installations share the directory.

## Dependency audit

The initial production dependency audit reports nine moderate findings through two transitive dependency chains and no high/critical findings. ExcelJS uses only uuid v4, whereas [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) concerns buffer-based v3/v5/v6. The computer-input library includes Jimp/file-type, with [GHSA-5v7r-6r5c-r473](https://github.com/advisories/GHSA-5v7r-6r5c-r473) affecting malformed ASF detection. Companion does not expose Jimp image-file decoding or file-type detection to tools; its OCR accepts screen PNG bytes. This is a reachability assessment, not removal of the flagged packages. Reassess/pin compatible upstream fixes before broader computer-use expansion. Do not run forced major-version audit fixes without native regression checks.
