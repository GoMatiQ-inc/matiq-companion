const fs = require("node:fs/promises");
const { createReadStream, createWriteStream } = require("node:fs");
const { createHash } = require("node:crypto");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const path = require("node:path");
const os = require("node:os");
function sharedRoot(
  platform = process.platform,
  home = os.homedir(),
  env = process.env,
) {
  return platform === "darwin"
    ? path.join(home, "Library", "Application Support", "MatiQ", "Models")
    : platform === "win32"
      ? path.join(
          env.LOCALAPPDATA || path.join(home, "AppData", "Local"),
          "MatiQ",
          "Models",
        )
      : path.join(
          env.XDG_DATA_HOME || path.join(home, ".local", "share"),
          "matiq",
          "models",
        );
}
class ModelStore {
  constructor(root) {
    this.root = root;
  }
  location(m) {
    if (
      !["llm", "asr", "speaker", "ocr"].includes(m.kind) ||
      !/^[a-f0-9]{64}$/.test(m.sha256) ||
      !/^[A-Za-z0-9._-]+$/.test(m.file)
    )
      throw Error("Use a catalog model with a supported kind and SHA-256.");
    return path.join(this.root, m.kind, m.sha256, m.file);
  }
  async verify(m) {
    try {
      const f = this.location(m);
      if ((await fs.stat(f)).size !== m.bytes) return false;
      const hash = createHash("sha256");
      for await (const c of createReadStream(f)) hash.update(c);
      return hash.digest("hex") === m.sha256;
    } catch (e) {
      if (e.code === "ENOENT") return false;
      throw e;
    }
  }
  async download(m, signal, progress = () => {}) {
    const dest = this.location(m);
    await fs.mkdir(path.dirname(dest), { recursive: true, mode: 0o700 });
    const lock = await fs.open(dest + ".lock", "wx", 0o600).catch((e) => {
      if (e.code === "EEXIST")
        throw Error(
          "Another MatiQ app is downloading this artifact. Wait for it to finish; remove a stale lock only after confirming no download is running.",
        );
      throw e;
    });
    const partial = dest + ".partial";
    try {
      if (await this.verify(m)) return dest;
      const disk = await fs.statfs(this.root);
      if (Number(disk.bavail) * Number(disk.bsize) < m.bytes + 2 * 1024 ** 3)
        throw Error(
          "Free disk space before downloading: keep at least 2 GiB available afterwards.",
        );
      const response = await fetch(m.url, { signal });
      if (!response.ok || !response.body)
        throw Error(
          `Download failed (${response.status}). Check the network and retry.`,
        );
      let bytes = 0;
      const hash = createHash("sha256");
      const meter = new Transform({
        transform(chunk, _, cb) {
          bytes += chunk.length;
          if (bytes > m.bytes)
            return cb(Error("Download exceeds the catalog size."));
          hash.update(chunk);
          progress(bytes / m.bytes);
          cb(null, chunk);
        },
      });
      await pipeline(
        Readable.fromWeb(response.body),
        meter,
        createWriteStream(partial, { mode: 0o600 }),
        { signal },
      );
      if (bytes !== m.bytes || hash.digest("hex") !== m.sha256)
        throw Error("Model checksum mismatch. Download again.");
      await fs.rename(partial, dest);
      await fs.writeFile(
        dest + ".json",
        JSON.stringify({
          schema: 1,
          kind: m.kind,
          format: m.format,
          sha256: m.sha256,
          bytes: m.bytes,
          id: m.id,
          license: m.license,
        }) + "\n",
        { mode: 0o600 },
      );
      return dest;
    } finally {
      await lock.close();
      await fs.rm(partial, { force: true });
      await fs.rm(dest + ".lock", { force: true });
    }
  }
  async inventory() {
    const found = [];
    for (const kind of ["llm", "asr", "speaker", "ocr"]) {
      const dir = path.join(this.root, kind);
      let hashes;
      try {
        hashes = await fs.readdir(dir);
      } catch (e) {
        if (e.code === "ENOENT") continue;
        throw e;
      }
      for (const hash of hashes) {
        const d = path.join(dir, hash);
        for (const name of await fs.readdir(d)) {
          if (name.endsWith(".json")) {
            const m = JSON.parse(await fs.readFile(path.join(d, name), "utf8"));
            found.push(m);
          }
        }
      }
    }
    return found;
  }
}
module.exports = { ModelStore, sharedRoot };
