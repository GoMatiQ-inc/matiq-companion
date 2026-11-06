const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
if (process.platform === "darwin") {
  const headers = path.resolve(path.dirname(process.execPath), "../include/node");
  if (!fs.existsSync(path.join(headers, "node_api.h"))) throw Error("Use an official Node 24 installation with include/node headers to build the Mac input module.");
  const root = path.resolve(__dirname, "..");
  const result = spawnSync("clang++", ["-std=c++17", "-O2", "-bundle", "-undefined", "dynamic_lookup", "-mmacosx-version-min=14.2", "-I", headers, "-framework", "ApplicationServices", "-framework", "CoreGraphics", "-framework", "AppKit", path.join(root, "src/native/mac-computer.mm"), "-o", path.join(root, "src/native/mac-computer.node")], { stdio: "inherit", timeout: 120000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error("Mac input compilation failed. Install Apple's command-line developer tools and inspect the compiler error.");
  console.log("Built native Mac input for " + process.arch);
}

if (process.platform === "win32") {
  const root = path.resolve(__dirname, "..");
  const directory = path.join(root, ".native-build");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "binding.gyp"), JSON.stringify({ targets: [{ target_name: "companion_windows", sources: [path.join(root, "src/native/windows-computer.cc")], libraries: ["user32.lib"], defines: ["NAPI_VERSION=8"] }] }));
  const version = require("electron/package.json").version;
  const result = spawnSync(process.execPath, [require.resolve("node-gyp/bin/node-gyp.js"), "rebuild", "--directory", directory, "--arch=" + process.arch, "--target=" + version, "--dist-url=https://electronjs.org/headers"], { stdio: "inherit", timeout: 240000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error("Windows input compilation failed. Use the matching Visual Studio C++ build tools and inspect the error above.");
  fs.copyFileSync(path.join(directory, "build/Release/companion_windows.node"), path.join(root, "src/native/windows-computer.node"));
  fs.rmSync(directory, { recursive: true });
  console.log("Built native Windows input for " + process.arch);
}
