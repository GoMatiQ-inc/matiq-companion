import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import yaml from "js-yaml";
export async function verifyUpdateAssets(directory, version, platform, arch = platform === "darwin" ? "arm64" : "x64") {
  const mac = platform === "darwin";
  const name = `MatiQ-Companion-${version}-${mac ? `mac-${arch}.zip` : `windows-${arch}.exe`}`;
  const metadataName = mac ? "latest-mac.yml" : "latest.yml";
  const metadata = yaml.load(
    await readFile(path.join(directory, metadataName), "utf8"),
  );
  const bytes = await readFile(path.join(directory, name));
  assert.equal(
    metadata.version,
    version,
    "Update metadata must match the release version.",
  );
  assert.equal(
    metadata.files?.length,
    1,
    "Publish only the qualified update package.",
  );
  assert.equal(
    metadata.files[0].url,
    name,
    "Update URL must identify the local qualified package.",
  );
  assert.equal(
    metadata.files[0].sha512,
    createHash("sha512").update(bytes).digest("base64"),
    "Update checksum does not match the package.",
  );
  assert.equal(
    metadata.files[0].size,
    bytes.length,
    "Update size does not match the package.",
  );
  // Older updater clients may read these legacy fields.
  if (metadata.path !== undefined) assert.equal(metadata.path, name);
  if (metadata.sha512 !== undefined)
    assert.equal(metadata.sha512, metadata.files[0].sha512);
  return [name, metadataName];
}

export function desktopUpdateFeed(arm, intel, platform) {
  assert.ok(["darwin","win32"].includes(platform),"Choose a qualified desktop platform.");
  const suffix=platform==="darwin"?"mac":"windows",extension=platform==="darwin"?"zip":"exe";
  assert.equal(arm.version,intel.version,"Both desktop update entries must have the same version.");
  for(const [metadata,arch] of [[arm,'arm64'],[intel,'x64']]) {
    assert.equal(metadata.files?.length,1,"Use exactly one verified update per architecture.");
    assert.equal(metadata.files[0].url,`MatiQ-Companion-${metadata.version}-${suffix}-${arch}.${extension}`,"Keep native update architecture entries in their verified order.");
  }
  return yaml.dump({...intel,files:[...arm.files,...intel.files]});
}
