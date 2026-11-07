"use strict";
// In-memory design data only. This bridge has no Electron, filesystem, or model access.
(() => {
  const hosted =
    new URLSearchParams(location.search).get("mode") !== "standalone";
  const clone = (x) => structuredClone(x),
    listeners = [],
    projects = [];
  const models = [
    {
      id: "qwen3-0.6b",
      name: "Qwen3 0.6B",
      bytes: 397000000,
      note: "Compact model for lighter machines.",
      installed: true,
    },
    {
      id: "qwen3-4b",
      name: "Qwen3 4B",
      bytes: 2497280256,
      note: "Recommended for everyday assistance.",
      installed: true,
    },
  ];
  const state = {
    version: "0.1.5",
    applicationName: hosted ? "MatiQ Solutions" : "MatiQ Companion",
    hosted,
    busy: false,
    settings: { model: "qwen3-4b" },
    models,
    recommended: "qwen3-4b",
    hardware: {
      platform: "darwin",
      arch: "arm64",
      cpu: "Apple silicon · preview data",
      memoryBytes: 32 * 1024 ** 3,
      freeDiskBytes: 80 * 1024 ** 3,
    },
    runtime: null,
    projects,
    sharedInventory: [],
    modelRoot: "/Preview/Models",
    computerAccess: { screen: "granted", input: "granted" },
    updates: { status: "idle", message: "No updates available." },
  };
  const get = (id) => {
    const p = projects.find((x) => x.id === id);
    if (!p)
      throw Error("This preview conversation was not found. Start a new chat.");
    return p;
  };
  function make(kind, name) {
    const p = {
      id: crypto.randomUUID(),
      kind,
      name: name || (kind === "chat" ? "New chat" : "New project"),
      messages: [],
      tools: { files: false, documents: false, search: false, computer: false },
      grants: [],
    };
    projects.unshift(p);
    return p;
  }
  window.companion = {
    onEvent: (fn) => listeners.push(fn),
    call: async (name, args = {}) => {
      if (name === "state") return clone(state);
      if (name === "chat.create") return clone(make("chat"));
      if (name === "project.create") return clone(make("project", args.name));
      if (name === "project.open") return clone(get(args.id));
      if (name === "project.policy") {
        const p = get(args.id);
        p.tools[args.tool] = args.enabled;
        return clone(p);
      }
      if (name === "chat.send") {
        const p = get(args.id);
        p.messages.push(
          { role: "user", text: args.text },
          {
            role: "assistant",
            text: "This is a design preview using the installed Companion interface. Responses here are scripted; no model or computer action was run.",
          },
        );
        if (p.name === "New chat") p.name = args.text.slice(0, 50);
        return;
      }
      if (name === "chat.cancel") return;
      if (name === "models.select") {
        state.settings.model = args.id;
        return clone(state);
      }
      if (name === "models.download") {
        models.find((m) => m.id === args.id).installed = true;
        return;
      }
      if (name === "models.cancel") return;
      if (name === "hardware.probe") {
        state.runtime = {
          gpu: "Apple Metal",
          devices: ["Apple silicon · preview"],
        };
        return clone(state.runtime);
      }
      if (name === "computer.access") return clone(state.computerAccess);
      if (name.startsWith("update.")) return clone(state.updates);
      if (name === "files.list")
        return { root: "/Preview/Conversation files", files: [] };
      if (name === "chat.attach") {
        const p = get(args.id),
          a = {
            id: crypto.randomUUID(),
            name: "Example brief.txt",
            root: "/Preview/Example brief.txt",
            write: false,
          };
        p.grants.push(a);
        return { project: clone(p), attachments: [clone(a)] };
      }
      if (name === "grant.add") {
        const p = get(args.id);
        p.grants.push({
          id: crypto.randomUUID(),
          root: args.file
            ? "/Preview/Example brief.txt"
            : "/Preview/Example folder",
          write: args.mode === "write",
        });
        return clone(p);
      }
      if (name === "grant.remove") {
        const p = get(args.id);
        p.grants = p.grants.filter((g) => g.id !== args.grant);
        return clone(p);
      }
      if (name === "approval.respond") return;
      throw Error(
        "Prototype only: " +
          name +
          " does not open or change files, accounts or system settings.",
      );
    },
  };
})();
