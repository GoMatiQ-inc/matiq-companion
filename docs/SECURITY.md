# Security boundaries

The renderer has no Node integration and uses context isolation, sandboxing, a restrictive CSP, plain-text output and a narrow preload API. Main-frame IPC checks reject unrelated senders. Navigation and new windows are denied. Model inference runs in a separate process; no arbitrary shell/eval tool is exposed.

Tool groups start disabled per project. Native pickers create explicit read or write grants. Project-relative paths stay inside the project's files directory; traversal, NUL and symlink paths are rejected. Broad grants still cannot modify Companion's application/profile/model directories. Tool permissions and grants are checked again after user approval. Overwrites preserve prior bytes in project history.

Every write, move, Office mutation, network request and computer action needs approval. A turn has a three-minute limit and twelve-tool budget; approval expires after two minutes. Stop cancels pending approvals and inference. Activity receipts are local; generated content and prior versions can consume disk and may contain private data.

Web tools allow bounded HTTPS public destinations only, revalidate redirects and pin validated DNS addresses to prevent ordinary SSRF/rebinding. Website/file content is untrusted input. These controls do not guarantee model immunity to prompt injection: review actual action arguments before approving. Search providers receive the query, and visited sites receive requests.

Computer use is a broader capability than file access. Approved screen observation can capture sensitive text from the primary display, and input can operate any foreground application. Each input requires a recent observation and invalidates that observation. OCR and coordinate input are experimental and can misidentify targets; a submitted input is not proof that the destination action succeeded. No background autonomous computer control is enabled.

This is a single-user desktop application, not an isolation boundary against another hostile process running as the same OS user. Such a process could alter files between checks. Protect the OS account and disk. No multi-user server, remote inference or network listener is provided.

Report vulnerabilities privately to the repository maintainers; avoid public issues containing private files, model prompts or credentials.
