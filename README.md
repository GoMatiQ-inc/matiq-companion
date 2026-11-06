# MatiQ Companion

A local desktop AI workspace by MatiQ Solutions, in the MatiQ Tools family. Download a verified model, chat on your own hardware, and choose which tools each project may use.

## Current status

Native development and packaged checks pass on Apple Silicon, Intel Mac, Windows x64 and Windows ARM64, including real local inference, documents and separate-application computer input. Public installers and exact signed-update qualification are listed on the [current release](https://github.com/GoMatiQ-inc/matiq-companion/releases/latest) and in the [validation record](docs/VALIDATION.md). Signed Windows distribution awaits Microsoft company identity validation and an issued certificate profile. Computer use requires explicit project enablement, individual approvals and normal OS privacy permissions.

## Install on a Mac

Open the [current release](https://github.com/GoMatiQ-inc/matiq-companion/releases/latest), check its qualified architectures, and download the matching **mac-arm64.pkg** for Apple Silicon or **mac-x64.pkg** for Intel when offered. Follow macOS installer prompts. Download a verified local model during setup; model weights are separate from the installer. An architecture is available only when its installer is included in that release.

For later releases, use **Settings → Check for updates → Download update → Restart to update**. Restart becomes available after the download completes. See the release's checksums and validation record for exact scope.

## Features

- Local Qwen GGUF inference through llama.cpp, with CPU/GPU detection, conservative RAM recommendations, progress and SHA-256 verified model downloads.
- Persistent projects with one conversation, generated files and independent file, document, web and computer permissions.
- Scoped file reading, writing and moving; native pickers grant access to specific files/folders. Mutations require individual approval and preserve overwritten content in project history.
- Real Word `.docx` creation/paragraph replacement and Excel `.xlsx` creation/cell editing. This is not a full Office editor: rewritten Word paragraphs lose their original inline styling; spreadsheet formulas/macros are not generated.
- Optional public web search/page reading. Queries and requested pages leave the device only when approved. Public search providers may rate-limit or block requests.
- Experimental, separately enabled computer observation and input: local OCR on the primary display and approval for each capture, click, key or text action. macOS Accessibility/Screen Recording permissions are required. Computer control can reach outside granted folders; enable it only with that understanding.
- Installed releases can check GitHub, download an update and restart to install it. Model/project storage lives outside the application bundle.

## Development

Use Node 24, matching the embedded inference-worker runtime. Run `npm ci`, `npm test`, then `npm start`. Linux desktop tests need an X server (`xvfb-run -a npm run test:desktop`). `npm run package` builds the current platform installer without publishing it. Native dependencies must be installed and packaged on the target platform.

`npm run test:inference` downloads and verifies the smallest catalog model and performs real native inference (Metal on qualified Apple Silicon runners; a CPU baseline on hosted Windows runners). Set `COMPANION_VALIDATION_MODELS` to an isolated model-store directory; never point tests at someone else's live profile. See [model storage](docs/MODELS.md), [security boundaries](docs/SECURITY.md), and [release/update qualification](docs/RELEASES.md).

## MatiQ Voice interoperability

Both apps use a typed MatiQ model-store layout. Shared artifacts are identified by kind and hash; ASR, speaker and chat models remain distinct. MatiQ Voice 0.3.9 and later include the shared-store bridge; update older installations before expecting sharing. Companion does not modify an installed Voice profile. Existing Voice worker paths can use hard links on the same filesystem, with a copy fallback across volumes. Sharing a directory does not make a speech model usable as a chat model.

## License

[The MatiQ Companion No-Sale License](LICENSE) matches the current MatiQ Voice terms: source is available for personal and internal business use, with no paid resale/hosting/bundling. These are source-available terms, not an OSI-approved open-source license. Model weights and third-party dependencies retain their own licenses. The MatiQ Solutions wordmark is owned by MatiQ Inc; see [NOTICE](NOTICE).
