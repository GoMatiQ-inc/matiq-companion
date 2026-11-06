const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
if (process.platform === "darwin") {
  const headers = path.resolve(path.dirname(process.execPath), "../include/node");
  if (!fs.existsSync(path.join(headers, "node_api.h"))) throw Error("Use an official Node 22+ installation with include/node headers to build the Mac input module.");
  const root = path.resolve(__dirname, "..");
  const result = spawnSync("clang++", ["-std=c++17", "-O2", "-bundle", "-undefined", "dynamic_lookup", "-mmacosx-version-min=14.2", "-I", headers, "-framework", "ApplicationServices", "-framework", "CoreGraphics", path.join(root, "src/native/mac-computer.cc"), "-o", path.join(root, "src/native/mac-computer.node")], { stdio: "inherit", timeout: 120000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error("Mac input compilation failed. Install Apple's command-line developer tools and inspect the compiler error.");
  console.log("Built native Mac input for " + process.arch);
}
