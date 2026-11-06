# MatiQ Companion

Standalone local desktop software in the MatiQ Tools family, presented with the MatiQ Solutions wordmark. Read README.md and docs/SECURITY.md before changing behavior.

- Keep inference local. Internet access requires explicit user enablement. Downloaded models are never committed.
- Model output and tool arguments are untrusted. Enforce file grants in the main process, not the renderer or system prompt.
- Never expose arbitrary shell, eval, raw Electron IPC, or unrestricted filesystem APIs to the model or renderer.
- Persistent user data belongs outside the app bundle. Preserve original files and record actual tool failures.
- Do not claim a native platform is qualified from mocked adapters or a different OS. Record actual installer/capture/input results in docs/VALIDATION.md.
- Keep generated dependencies/build output out of Git. Follow inherited storage/worktree/lifecycle requirements.
