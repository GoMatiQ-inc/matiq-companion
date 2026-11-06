# Local models and hardware

The catalog contains official Qwen3 GGUF artifacts, licensed Apache 2.0 by their publisher. `src/catalog.cjs` pins the publisher URL, exact byte count and SHA-256. Models download only after user action; partial or mismatched files never become usable. A model hash is verified before each chat turn.

The initial catalog offers Qwen3 0.6B Q8 (approximately 610 MiB), 1.7B Q8 (1.71 GiB) and 4B Q4_K_M (2.33 GiB). Recommendations use total memory thresholds of 4, 8 and 16 GiB respectively; this is a conservative starting point, not a guarantee of latency or tool reliability. Applications, context size and GPU availability affect usable memory. Small models can produce poor answers and tool arguments. CPU fallback remains available.

## Shared storage contract, schema 1

- macOS: `~/Library/Application Support/MatiQ/Models`
- Windows: `%LOCALAPPDATA%/MatiQ/Models`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/matiq/models`

Each artifact is `kind/sha256/filename`, with an adjacent `.json` containing schema, ID, kind, format, hash, bytes and license. Kinds include `llm`, `asr`, `speaker` and `ocr`. Exclusive `.lock` files coordinate writers. Inspect a stale lock and the owning process before removing it. Applications must not delete artifacts another family app may use. There is no automatic model garbage collection in this version.

Downloads need room for the full artifact plus a 2 GiB free-space floor. An installer does not bundle model weights. Voice interoperability requires its bridge version, not merely installing Companion.
