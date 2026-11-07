# MatiQ Companion

Standalone local desktop software in the MatiQ Tools family, presented with the MatiQ Solutions wordmark. Read README.md and docs/SECURITY.md before changing behavior.

- Keep inference local. Internet access requires explicit user enablement. Downloaded models are never committed.
- Model output and tool arguments are untrusted. Enforce file grants in the main process, not the renderer or system prompt.
- Never expose arbitrary shell, eval, raw Electron IPC, or unrestricted filesystem APIs to the model or renderer.
- Persistent user data belongs outside the app bundle. Preserve original files and record actual tool failures.
- Do not claim a native platform is qualified from mocked adapters or a different OS. Record actual installer/capture/input results in docs/VALIDATION.md.
- Keep generated dependencies/build output out of Git. Follow inherited storage/worktree/lifecycle requirements.

## Prototype first

Before implementing UI changes, create or update the repository-owned prototype with the Solutions desktop SDK. Use the exact shared shell and existing renderer source. Do not maintain duplicate tool UI in the suite repository. Register/build it into the Solutions prototype, review standalone and hosted modes, and wait for explicit owner approval before applying the design. Saved feedback alone is not approval. Keep mock desktop bridges under prototype/, native code unchanged, and generated output/local registration ignored.
