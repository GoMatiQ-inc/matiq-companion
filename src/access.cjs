const fs = require("node:fs/promises");
const path = require("node:path");
function inside(root, target) {
  const rel = path.relative(root, target);
  return (
    rel === "" ||
    (!path.isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + path.sep))
  );
}
class Access {
  constructor(projectFolder, grants = [], protectedRoots = []) {
    this.project = path.join(projectFolder, "files");
    this.protectedRoots = [
      path.dirname(path.dirname(projectFolder)),
      ...protectedRoots,
    ];
    this.grants = [{ root: this.project, write: true }, ...grants];
  }
  async resolve(input, write = false) {
    if (typeof input !== "string" || !input || input.includes("\0"))
      throw Error("Provide a valid file path.");
    const target = path.isAbsolute(input)
      ? path.resolve(input)
      : path.resolve(this.project, input);
    // Reject symlinks in every existing component, including the final file. A local hostile process is outside the threat model; recheck immediately before IO.
    let cursor = path.parse(target).root;
    for (const segment of target
      .slice(cursor.length)
      .split(path.sep)
      .filter(Boolean)) {
      cursor = path.join(cursor, segment);
      try {
        const st = await fs.lstat(cursor);
        if (st.isSymbolicLink())
          throw Error(
            "Symbolic links are not permitted. Grant access to the real folder instead.",
          );
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    }
    if (
      !inside(this.project, target) &&
      this.protectedRoots.some((root) => inside(path.resolve(root), target))
    )
      throw Error(
        "Application state, executable code and model storage cannot be accessed through file tools. Use project files instead.",
      );
    for (const grant of this.grants) {
      const root = await fs.realpath(grant.root);
      if (inside(root, target) && (!write || grant.write)) return target;
    }
    throw Error(
      write
        ? "This location is not writable. Add an explicit write grant in Files."
        : "This location is not in the project or your allowed folders. Add a file/folder grant first.",
    );
  }
}
module.exports = { Access, inside };
