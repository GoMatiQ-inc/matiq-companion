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
  updateState = null;
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
    .catch(() => {});
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
  live = "";
  activity = [];
  view = "chat";
  render();
}
function navigate(next) {
  view = next;
  render();
}
function render() {
  const nav = $("#nav");
  nav.replaceChildren();
  for (const [id, label] of [
    ["chat", "Chat"],
    ["projects", "Projects"],
    ["models", "Models"],
    ["files", "File access"],
    ["tools", "Tools"],
  ]) {
    const b = button(label, () => navigate(id));
    if (view === id) b.classList.add("active");
    nav.append(b);
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
    for (const p of snapshot.projects) {
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
    checkUpdate.disabled = ["development", "checking", "downloading", "downloaded"].includes(u.status);
    downloadUpdate.disabled = u.status !== "available";
    restartUpdate.disabled = u.status !== "downloaded";
    panel.append(actions(checkUpdate, downloadUpdate, restartUpdate));
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
  if (!project) {
    root.append(
      heading(
        "Your own AI workspace.",
        "Choose a local model, create a project, and decide what Companion can access.",
      ),
    );
    root.append(
      actions(
        button("Create a project", () => navigate("projects"), true),
        button("Choose a model", () => navigate("models")),
      ),
    );
    return;
  }
  if (view === "tools") {
    root.append(
      heading(
        "Tools you control.",
        "Each project has its own permissions. File changes, web requests and every computer action require your approval.",
      ),
    );
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
      check.checked = project.tools[id];
      check.setAttribute("aria-label", title);
      const projectId = project.id;
      check.onchange = run(async () => {
        const enabled = check.checked;
        check.disabled = true;
        try {
          const updated = await call("project.policy", {
            id: projectId,
            tool: id,
            enabled,
          });
          if (project?.id === projectId) project = updated;
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
      root.append(box);
    }
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
  root.append(
    heading(
      "Think, write and make things.",
      "Chat runs on this device. Enable only the tools this project needs.",
    ),
  );
  const top = actions(
    button("Project files", () => navigate("files")),
    button("Manage tools", () => navigate("tools")),
  );
  root.append(top);
  const messages = el("div", undefined, "messages");
  messages.id = "messages";
  for (const m of project.messages) {
    const box = el(
      "article",
      undefined,
      "message " + m.role + (m.status === "interrupted" ? " interrupted" : ""),
    );
    box.append(
      el("strong", m.role === "user" ? "You" : "Companion"),
      el("div", m.text),
    );
    if (m.error) box.append(el("p", m.error, "error"));
    messages.append(box);
  }
  const pending = el("article", undefined, "message assistant");
  pending.id = "live-message";
  pending.hidden = !snapshot.busy;
  pending.textContent = live || "Loading local model…";
  messages.append(pending);
  root.append(messages);
  const form = el("form", undefined, "composer"),
    text = el("textarea");
  text.id = "message";
  text.placeholder =
    "Ask Companion. Describe a file you want to create, or ask a question.";
  text.setAttribute("aria-label", "Message Companion");
  const send = el("button", "Send", "primary");
  send.type = "submit";
  send.disabled = snapshot.busy;
  form.append(
    text,
    actions(
      el(
        "span",
        snapshot.busy ? "Working locally…" : "Project: " + project.name,
        "caption",
      ),
      button("Stop", () => call("chat.cancel")),
      send,
    ),
  );
  form.onsubmit = (e) => {
    e.preventDefault();
    run(async () => {
      await call("chat.send", { id: project.id, text: text.value });
      text.value = "";
      snapshot.busy = true;
      live = "";
      render();
    })();
  };
  root.append(form);
  const log = el("div", activity.join("\n"), "activity");
  log.id = "activity";
  root.append(log);
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
