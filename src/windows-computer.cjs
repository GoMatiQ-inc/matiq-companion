const { spawn } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");
function windowsInput(action, args, display, signal) {
  const payload = { ...args, action };
  if (action === "click_screen") {
    payload.x = Math.round((display.bounds.x + args.x) * display.scaleFactor);
    payload.y = Math.round((display.bounds.y + args.y) * display.scaleFactor);
  }
  // Only this bundled program is executable. Model text is JSON on stdin, never PowerShell code.
  const program = readFileSync(path.join(__dirname, "native/windows-computer.ps1"), "utf8");
  const executable = path.join(process.env.SystemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe");
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(program, "utf16le").toString("base64")], { windowsHide: true, signal });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => child.kill(), 15000);
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk).slice(-4000); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(Error("Windows input failed: " + (stderr.trim() || "the native helper stopped")));
      try { if (JSON.parse(stdout).dispatched !== true) throw Error("Native input was not acknowledged."); resolve(); }
      catch (error) { reject(error); }
    });
    child.stdin.on("error", (error) => { if (error.code !== "EPIPE") reject(error); });
    child.stdin.end(JSON.stringify(payload));
  });
}
module.exports = { windowsInput };
