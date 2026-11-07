const api = window.companion;
const $ = (s) => document.querySelector(s);
const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
let snapshot,
  project = null,
  view = "chat",
  approval = null,
  live = "",
  activity = [],
  updateState = null,
  draft = "",
  attachments = [],
  submitting = false,
  creatingChat = null;
async function call(name, args) {
  try {
    $("#error").hidden = true;
    return await api.call(name, args);
  } catch (e) {
    $("#error").hidden = false;
    $("#error").textContent = e.message;
    throw e;
  }
}
const run = (fn) => () =>
  Promise.resolve()
    .then(fn)
    .catch(error => {
      $("#error").hidden = false; $("#error").textContent = error.message;
    });
function button(label, fn, primary = false) {
  const b = el("button", label, primary ? "primary" : "");
  b.type = "button";
  b.onclick = run(fn);
  return b;
}
function heading(title, description) {
  const box = el("div");
  box.append(el("h1", title), el("p", description));
  return box;
}
function field(label, control) {
  const box = el("div", undefined, "field");
  const l = el("label", label);
  l.htmlFor = control.id;
  box.append(l, control);
  return box;
}
function input(id, value = "", placeholder = "") {
  const n = el("input");
  n.id = id;
  n.value = value;
  n.placeholder = placeholder;
  return n;
}
function actions(...children) {
  const d = el("div", undefined, "actions");
  d.append(...children);
  return d;
}
async function refresh() {
  snapshot = await call("state");
  if (project) project = await call("project.open", { id: project.id });
  render();
}
async function openProject(id) {
  project = await call("project.open", { id });
  $("#message") && ($("#message").value = "");
  draft = "";
  attachments = [];
  live = "";
  activity = [];
  view = "chat";
  render();
}
async function ensureChat() {
  if (project) return project;
  if (!creatingChat) creatingChat = call("chat.create").then(async chat => {
    project = chat; snapshot = await call("state"); return chat;
  }).finally(() => {creatingChat = null;});
  return creatingChat;
}
function newChat() {
  if (snapshot.busy || submitting || creatingChat) throw Error("Stop the current response before starting a new chat.");
  if ($("#message")) $("#message").value = "";
  project = null; draft = ""; attachments = []; live = ""; activity = []; view = "chat"; render();
  $("#message")?.focus();
}
function navigate(next) {
  view = next;
  render();
}
function permissionRows(container) {
    for (const [id, title, note] of [
      [
        "files",
        "Files",
        "Read granted locations; create, modify and move files after approval. Project files are the default scope.",
      ],
      [
        "documents",
        "Word and Excel",
        "Create DOCX/XLSX files, read documents and edit paragraphs or cells. Existing files are backed up before replacement.",
      ],
      [
        "search",
        "Internet search",
        "Allow public HTTPS search and page reading. Queries and URLs are shown before transmission; downloaded model files are separate.",
      ],
      [
        "computer",
        "Computer use",
        "Read the primary screen with local OCR and dispatch approved clicks or typing. Computer use can affect apps and files outside your file grants. Companion hides while observing or acting.",
      ],
    ]) {
      const box = el("div", undefined, "row"),
        label = el("label", undefined, "check"),
        check = el("input");
      check.type = "checkbox";
      check.checked = project?.tools[id] || false;
      check.setAttribute("aria-label", title);
      let projectId;
      check.onchange = run(async () => {
        const enabled = check.checked;
        projectId = (await ensureChat()).id;
        check.disabled = true;
        try {
          const updated = await call("project.policy", {
            id: projectId,
            tool: id,
            enabled,
          });
          if (project?.id === projectId) {project = updated; $("#privacy").textContent = project.tools.search ? "Web access enabled" : "Local processing";}
        } catch (error) {
          check.checked = !enabled;
          throw error;
        } finally {
          check.disabled = false;
        }
      });
      const words = el("span");
      words.append(el("strong", title), el("small", note));
      label.append(check, words);
      box.append(label);
      container.append(box);
    }
}
function render() {
  const currentDraft = $("#message");
  if (currentDraft) draft = currentDraft.value;
  document.body.classList.toggle("chat-view", view === "chat");
  const nav = $("#nav");
  nav.replaceChildren();
  const fresh = button("+  New chat", newChat);
  fresh.setAttribute("aria-label", "New chat");
  fresh.disabled = snapshot.busy || submitting;
  nav.append(fresh);
  for (const [id, label] of [
    ["chat", "Chat"],
    ["projects", "Projects"],
    ["models", "Models"],
  ]) {
    const b = button(label, () => navigate(id));
    if (view === id) b.classList.add("active");
    nav.append(b);
  }
  const chats = snapshot.projects.filter(p => p.kind === "chat");
  if (chats.length) {
    nav.append(el("span", "Recent chats", "nav-label"));
    for (const chat of chats.slice(0, 20)) {
      const item = button(chat.name, () => openProject(chat.id));
      item.className = "chat-history" + (project?.id === chat.id ? " active" : "");
      item.title = chat.name;
      item.setAttribute("aria-label", "Open chat: " + chat.name);
      nav.append(item);
    }
  }
  $("#settings-nav").onclick = () => navigate("settings");
  $("#setup-nav").onclick = () => navigate("models");
  $("#page-title").textContent = {
    chat: project?.name || "Chat",
    projects: "Projects",
    models: "Models",
    files: "File access",
    tools: "Tools",
    settings: "Settings",
  }[view];
  $("#local-state").textContent =
    snapshot?.models.find((m) => m.id === snapshot.settings.model)?.name ||
    "Choose a local model";
  $("#privacy").textContent = project?.tools.search
    ? "Web access enabled"
    : "Local processing";
  const root = $("#content");
  root.replaceChildren();
  if (view === "projects") {
    root.append(
      heading(
        "A place for each project.",
        "Conversations, generated files and permissions stay together on this computer.",
      ),
    );
    const name = input("project-name", "", "Project name");
    root.append(
      field("New project", name),
      button(
        "Create project",
        async () => {
          const p = await call("project.create", { name: name.value });
          snapshot = await call("state");
          await openProject(p.id);
        },
        true,
      ),
    );
    for (const p of snapshot.projects.filter(p => p.kind !== "chat")) {
      const row = el("div", undefined, "row");
      row.append(
        el("strong", p.name),
        button("Open project", () => openProject(p.id)),
      );
      root.append(row);
    }
    return;
  }
  if (view === "models") {
    root.append(
      heading(
        "Models on your computer.",
        "Download once, verify the file, and run locally. No model account or separate inference server is required.",
      ),
    );
    const hw = snapshot.hardware;
    const facts = el("dl");
    for (const [k, v] of [
      ["Processor", hw.cpu],
      ["Memory", `${(hw.memoryBytes / 1024 ** 3).toFixed(1)} GiB`],
      ["Available disk", `${(hw.freeDiskBytes / 1024 ** 3).toFixed(1)} GiB`],
      [
        "Graphics",
        snapshot.runtime
          ? `${snapshot.runtime.gpu}: ${snapshot.runtime.devices?.join(", ") || "CPU"}`
          : "The runtime detects the available accelerator when loading a model.",
      ],
    ])
      facts.append(el("dt", k), el("dd", v));
    root.append(
      facts,
      actions(
        button("Detect graphics hardware", () => call("hardware.probe")),
        button("Cancel download", () => call("models.cancel")),
      ),
    );
    if (snapshot.sharedInventory?.length)
      root.append(
        el(
          "p",
          "Shared model store: " +
            snapshot.sharedInventory
              .map((m) => m.kind + " / " + m.id)
              .join(", "),
          "caption",
        ),
      );
    for (const m of snapshot.models) {
      const row = el("div", undefined, "row"),
        info = el("div");
      info.append(
        el(
          "strong",
          m.name + (m.id === snapshot.recommended ? " · Recommended" : ""),
        ),
        el("p", `${(m.bytes / 1024 ** 3).toFixed(2)} GiB download. ${m.note}`),
      );
      row.append(
        info,
        m.installed
          ? button(
              snapshot.settings.model === m.id ? "Selected" : "Use model",
              async () => {
                snapshot = await call("models.select", { id: m.id });
                render();
              },
            )
          : button("Download model", async () => {
              const b = row.querySelector("button");
              b.disabled = true;
              try {
                await call("models.download", { id: m.id });
                await refresh();
              } finally {
                b.disabled = false;
              }
            }),
      );
      const progress = el("progress");
      progress.id = "download-" + m.id;
      progress.max = 100;
      progress.value = 0;
      progress.hidden = true;
      info.append(progress);
      root.append(row);
    }
    root.append(
      el(
        "p",
        "Models are kept in a versioned MatiQ store. Speech, speaker and chat artifacts have different types; they are not interchangeable.",
        "caption",
      ),
      el("pre", snapshot.modelRoot),
    );
    return;
  }
  if (view === "settings") {
    root.append(
      heading(
        "Settings",
        "App updates preserve projects and downloaded models.",
      ),
    );
    const u = updateState || snapshot.updates;
    const panel = el("div", undefined, "panel");
    panel.append(
      el("h2", "Application updates"),
      el("p", `Installed version ${snapshot.version}. ${u.message}`),
    );
    const checkUpdate = button("Check for updates", async () => {
      updateState = await call("update.check");
      render();
    });
    const downloadUpdate = button("Download update", async () => {
      updateState = await call("update.download");
      render();
    });
    const restartUpdate = button("Restart to update", () => call("update.install"), true);
    checkUpdate.disabled = ["development", "checking", "downloading", "downloaded", "installing"].includes(u.status);
    downloadUpdate.disabled = u.status !== "available";
    restartUpdate.disabled = u.status !== "downloaded";
    panel.append(actions(checkUpdate, downloadUpdate, restartUpdate));
    const access = el("div", undefined, "panel");
    access.append(el("h2", "Computer access"), el("p", `Screen: ${snapshot.computerAccess.screen}. Input: ${snapshot.computerAccess.input}.`));
    if (snapshot.hardware.platform === "darwin") {
      access.append(el("p", `Approve ${snapshot.applicationName} in macOS Screen Recording and Accessibility. Restart after changing Screen Recording. Project tools and individual action approvals remain separate.`));
      access.append(actions(
        button("Request Screen Recording", async () => { await call("computer.access", { kind: "screen" }); await refresh(); }),
        button("Request Accessibility", async () => { await call("computer.access", { kind: "input" }); await refresh(); }),
        button("Refresh access status", refresh),
      ));
    } else access.append(el("p", "Computer tools operate normal desktop windows. Secure and elevated windows may block input."));
    root.append(access);

    root.append(
      panel,
      el(
        "p",
        "MatiQ Companion uses the same no-sale terms as MatiQ Voice. Local processing is free for personal and internal business use.",
        "caption",
      ),
    );
    return;
  }
  if (!project && view !== "chat") {
    root.append(heading("Choose a conversation", "Open a chat or project to manage its access."));
    return;
  }
  if (view === "tools") {
    root.append(
      heading(
        "Tools you control.",
        "Each project has its own permissions. File changes, web requests and every computer action require your approval.",
      ),
    );
    permissionRows(root);
    return;
  }
  if (view === "files") {
    root.append(
      heading(
        "Choose what Companion can access.",
        "New files stay inside this project. Grant additional files or folders explicitly; read and write access are separate.",
      ),
    );
    root.append(
      actions(
        button("Allow a read folder", async () => {
          project = await call("grant.add", { id: project.id, mode: "read" });
          render();
        }),
        button("Allow a read file", async () => {
          project = await call("grant.add", {
            id: project.id,
            mode: "read",
            file: true,
          });
          render();
        }),
        button("Allow a write folder", async () => {
          project = await call("grant.add", { id: project.id, mode: "write" });
          render();
        }),
        button("Show project files", () =>
          call("files.open", { id: project.id }),
        ),
      ),
    );
    for (const g of project.grants) {
      const row = el("div", undefined, "row"),
        info = el("div");
      info.append(
        el("strong", g.write ? "Read and write" : "Read only"),
        el("p", g.root),
      );
      row.append(
        info,
        button("Remove access", async () => {
          project = await call("grant.remove", { id: project.id, grant: g.id });
          render();
        }),
      );
      root.append(row);
    }
    const listing = el("div", undefined, "panel");
    listing.append(el("h2", "Project files"));
    root.append(listing);
    call("files.list", { id: project.id })
      .then((value) => {
        listing.append(el("p", value.root, "caption"));
        if (!value.files.length)
          listing.append(
            el("p", "Files created by Companion will appear here."),
          );
        for (const f of value.files)
          listing.append(el("div", f.name + (f.directory ? "/" : "")));
      })
      .catch(() => {});
    return;
  }
  const layout = el("section", undefined, "chat-layout");
  const messages = el("div", undefined, "messages");
  messages.id = "messages";
  messages.setAttribute("aria-label", "Conversation");
  const empty = !project?.messages.length && !snapshot.busy;
  layout.classList.toggle("empty-chat", empty);
  if (empty) {
    const welcome = heading("What can I help you with?", "Your ideas. Your files. On your device.");
    welcome.className = "chat-welcome";
    messages.append(welcome);
  }
  for (const m of project?.messages || []) {
    const box = el("article", undefined, "message " + m.role + (m.status === "interrupted" ? " interrupted" : ""));
    box.append(el("strong", m.role === "user" ? "You" : "Companion"), el("div", m.displayText || m.text));
    if (m.attachments?.length) box.append(el("small", m.attachments.map(a => a.name + (a.truncated ? " (excerpt)" : "")).join(", "), "message-files"));
    if (m.error) box.append(el("p", m.error, "error"));
    messages.append(box);
  }
  const pending = el("article", undefined, "message assistant");
  pending.id = "live-message"; pending.hidden = !snapshot.busy;
  pending.textContent = live || "Thinking on your device…";
  messages.append(pending);
  layout.append(messages);
  const dock = el("div", undefined, "composer-dock");
  const form = el("form", undefined, "composer"), text = el("textarea");
  text.id = "message"; text.value = draft; text.rows = 2;
  text.placeholder = "Message Companion…";
  text.setAttribute("aria-label", "Message Companion");
  text.oninput = () => {draft = text.value; text.style.height = "auto"; text.style.height = Math.min(text.scrollHeight, 180) + "px";};
  text.onkeydown = e => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      if (!snapshot.busy && !submitting) form.requestSubmit();
    }
  };
  const selected = el("div", undefined, "attachments");
  for (const a of attachments) {
    const chip = el("span", undefined, "attachment");
    chip.append(el("span", a.name), button("×", async () => {
      project = await call("grant.remove", {id: project.id, grant: a.id});
      attachments = attachments.filter(x => x.id !== a.id); render();
    }));
    chip.lastChild.setAttribute("aria-label", "Remove attachment " + a.name);
    selected.append(chip);
  }
  form.append(selected, text);
  const controls = el("div", undefined, "composer-controls");
  const plus = button("+", async () => {
    plus.disabled = true;
    try {
      const chat = await ensureChat();
      const result = await call("chat.attach", {id: chat.id});
      project = result.project;
      attachments.push(...result.attachments);
      render(); $("#message")?.focus();
    } finally {plus.disabled = false;}
  });
  plus.className = "attach-button"; plus.title = "Attach text, Word or Excel files";
  plus.setAttribute("aria-label", "Attach files");
  const permissions = el("details", undefined, "permissions-menu"), summary = el("summary", "Permissions");
  summary.setAttribute("aria-label", "Permissions");
  const menu = el("div", undefined, "permissions-panel");
  menu.append(el("strong", "Tools for this conversation"), el("p", "Selected files are read for your message. Tools control additional actions.", "caption"));
  permissionRows(menu);
  menu.append(button("Manage file access", async () => {await ensureChat(); navigate("files");}));
  permissions.append(summary, menu);
  const model = button(snapshot.models.find(m => m.id === snapshot.settings.model)?.name || "Choose a model", () => navigate("models"));
  model.className = "model-choice";
  const send = el("button", "↑", "primary send-button");
  send.type = "submit"; send.setAttribute("aria-label", "Send"); send.title = "Send message (Enter)";
  send.disabled = snapshot.busy || submitting;
  controls.append(plus, permissions, model);
  if (snapshot.busy) controls.append(button("Stop", () => call("chat.cancel")));
  controls.append(send); form.append(controls);
  form.onsubmit = e => {
    e.preventDefault();
    if (snapshot.busy || submitting || !text.value.trim()) return;
    submitting = true; send.disabled = true;
    run(async () => {
      try {
        const chat = await ensureChat();
        await call("chat.send", {id: chat.id, text: text.value, attachments: attachments.map(a => a.id)});
        text.value = ""; draft = ""; attachments = []; live = ""; snapshot.busy = true;
        snapshot = await call("state");
        project = await call("project.open", {id: chat.id});
        render(); $("#message")?.focus();
      } finally {
        submitting = false;
        if ($("#message")) $("#message").closest("form").querySelector('[aria-label="Send"]').disabled = snapshot.busy;
      }
    })();
  };
  dock.append(form, el("p", "Enter to send · Shift+Enter for a new line", "composer-hint"));
  const log = el("div", activity.join("\n"), "activity"); log.id = "activity"; dock.append(log);
  layout.append(dock); root.append(layout);
  messages.scrollTop = messages.scrollHeight;

}
api.onEvent((event) => {
  if (event.type === "chunk") {
    if (event.project !== project?.id) return;
    live += event.text;
    const n = $("#live-message");
    if (n) {
      n.hidden = false;
      n.textContent = live;
      $("#messages").scrollTop = $("#messages").scrollHeight;
    }
  } else if (event.type === "download") {
    const p = $("#download-" + event.id);
    if (p) {
      p.hidden = false;
      p.value = event.percent;
    }
  } else if (event.type === "runtime") {
    snapshot.runtime = event;
    if (view === "models") render();
  } else if (event.type === "activity") {
    activity.push(
      event.tool +
        ": " +
        event.status +
        (event.error ? " — " + event.error : ""),
    );
    if ($("#activity"))
      $("#activity").textContent = activity.slice(-8).join("\n");
  } else if (event.type === "approval") {
    approval = event.id;
    $("#approval-title").textContent = event.name.replaceAll("_", " ");
    $("#approval-warning").textContent =
      event.computerWarning ||
      "Review the exact requested action. Existing files are backed up before replacement.";
    $("#approval-preview").textContent = event.preview;
    $("#approval").showModal();
  } else if (event.type === "approval.closed") {
    if (approval === event.id) {
      approval = null;
      $("#approval").close();
    }
  } else if (event.type === "chat.finished") {
    snapshot.busy = false;
    live = "";
    refresh().catch(() => {});
    if (event.error) {
      $("#error").hidden = false;
      $("#error").textContent = event.error;
    }
  } else if (event.type === "update") {
    updateState = event.state;
    if (view === "settings") render();
  } else if (event.type === "fatal") {
    $("#error").hidden = false;
    $("#error").textContent = event.error;
  }
});
$("#allow").onclick = run(() =>
  call("approval.respond", { id: approval, allow: true }),
);
$("#deny").onclick = run(() =>
  call("approval.respond", { id: approval, allow: false }),
);
$("#approval").addEventListener("cancel", (e) => {
  e.preventDefault();
  run(() => call("approval.respond", { id: approval, allow: false }))();
});
refresh().catch(() => {});
