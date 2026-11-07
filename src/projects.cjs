const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
async function atomicJSON(file, value) {
  const tmp = file + "." + randomUUID() + ".tmp";
  try {
    await fs.writeFile(tmp, JSON.stringify(value, null, 2) + "\n", {mode: 0o600});
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(tmp, file);
        break;
      } catch (error) {
        // Windows scanners can briefly hold a file without allowing replacement.
        if (process.platform !== "win32" || !["EPERM", "EACCES", "EBUSY"].includes(error.code) || attempt >= 40) throw error;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  } finally {
    await fs.rm(tmp, {force: true});
  }
}
class Projects {
  constructor(root) {
    this.root = root;
    this.pending = new Map();
  }
  folder(id) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw Error("Choose an existing project.");
    return path.join(this.root, id);
  }
  async create(name, kind = "project") {
    if (typeof name !== "string" || !name.trim() || name.length > 100)
      throw Error("Name the project using 1–100 characters.");
    const id = randomUUID();
    const dir = this.folder(id);
    await fs.mkdir(path.join(dir, "files"), { recursive: true, mode: 0o700 });
    const p = {
      id,
      name: name.trim(),
      kind,
      createdAt: new Date().toISOString(),
      tools: { files: false, documents: false, search: false, computer: false },
      grants: [],
      messages: [],
    };
    await this.save(p);
    return p;
  }
  async update(id, mutate) {
    const previous = this.pending.get(id) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        const p = await this.get(id);
        await mutate(p);
        await this.save(p);
        return p;
      });
    this.pending.set(id, next);
    try {
      return await next;
    } finally {
      if (this.pending.get(id) === next) this.pending.delete(id);
    }
  }
  async get(id) {
    return JSON.parse(
      await fs.readFile(path.join(this.folder(id), "project.json"), "utf8"),
    );
  }
  async save(p) {
    await atomicJSON(path.join(this.folder(p.id), "project.json"), p);
  }
  async list() {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    const out = [];
    for (const id of await fs.readdir(this.root)) {
      if (/^[a-f0-9-]{36}$/.test(id)) {
        const p = await this.get(id);
        out.push({ id: p.id, name: p.name, kind: p.kind || "project", createdAt: p.createdAt });
      }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
module.exports = { Projects, atomicJSON };
