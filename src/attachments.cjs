const fs = require("node:fs/promises");
const path = require("node:path");
const {Access} = require("./access.cjs");
const docs = require("./documents.cjs");
async function readAttachments(projects, id, ids = [], protectedRoots = []) {
  if (!Array.isArray(ids) || ids.length > 6 || ids.some(id => typeof id !== "string"))
    throw Error("Attach up to six selected files.");
  const attachments = [];
  let remaining = 24000;
  for (const grantId of new Set(ids)) {
    const project = await projects.get(id);
    const grant = project.grants.find(g => g.id === grantId && g.attachment);
    if (!grant) throw Error("An attachment was removed. Select the file again.");
    const file = await new Access(projects.folder(id), project.grants, protectedRoots).resolve(grant.root);
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > 25 * 1024 ** 2) throw Error("Attach individual files under 25 MiB.");
    const bytes = await fs.readFile(file);
    const ext = path.extname(file).toLowerCase();
    if ([".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) throw Error("PDF and image attachments are not supported by this text model. Attach text, DOCX or XLSX instead.");
    let text;
    if (ext === ".docx") text = JSON.stringify(docs.readWord(bytes));
    else if (ext === ".xlsx") text = JSON.stringify(await docs.readWorkbook(bytes));
    else {
      if (bytes.length > 1024 ** 2 || bytes.includes(0)) throw Error("Attach UTF-8 text under 1 MiB, or a DOCX/XLSX file. PDF and image attachments are not supported by this text model.");
      try { text = new TextDecoder("utf-8", {fatal: true}).decode(bytes); }
      catch { throw Error("This attachment is not UTF-8 text. Choose a text, DOCX or XLSX file."); }
    }
    if (remaining <= 0) throw Error("These attachments exceed the chat context. Send fewer or smaller files.");
    const truncated = text.length > remaining;
    text = text.slice(0, remaining);
    remaining -= text.length;
    attachments.push({id: grantId, name: path.basename(file), text, truncated});
  }
  return attachments;
}
module.exports = {readAttachments};
