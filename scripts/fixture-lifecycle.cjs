const { execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");
function listeners() {
  if (process.platform === "win32") {
    return execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8", timeout: 15000 })
      .split(/\r?\n/)
      .flatMap((line) => {
        const parts = line.trim().split(/\s+/);
        return parts[0] === "TCP" && parts[3] === "LISTENING"
          ? [{ pid: Number(parts[4]), port: Number(parts[1].split(":").pop()) }]
          : [];
      });
  }
  if (process.platform === "darwin") {
    let text;
    try {
      text = execFileSync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"], {
        encoding: "utf8", timeout: 15000,
      });
    } catch (error) {
      if (error.status === 1 && !error.stdout?.length) return [];
      throw error;
    }
    let pid;
    const result = [];
    for (const line of text.split("\n")) {
      if (line.startsWith("p")) pid = Number(line.slice(1));
      else if (line.startsWith("n"))
        result.push({ pid, port: Number(line.split(":").pop()) });
    }
    return result;
  }
  return execFileSync("ss", ["-H", "-ltnp"], { encoding: "utf8", timeout: 15000 })
    .split("\n")
    .flatMap((line) => {
      const match = /pid=(\d+),/.exec(line);
      return match
        ? [
            {
              pid: Number(match[1]),
              port: Number(line.trim().split(/\s+/)[3].split(":").pop()),
            },
          ]
        : [];
    });
}
function capture(child) {
  return {
    pid: child.pid,
    ports: listeners()
      .filter((row) => row.pid === child.pid)
      .map((row) => row.port),
  };
}
function captureTree(owned) {
  if(!owned)return [];
  try {
  const rows=process.platform==='win32'
    ? JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop';@{rows=@(Get-CimInstance Win32_Process | ForEach-Object {@{pid=[int]$_.ProcessId;parent=[int]$_.ParentProcessId}})} | ConvertTo-Json -Depth 3 -Compress"],{encoding:'utf8',timeout:15000})).rows
    : execFileSync('/bin/ps',['-axo','pid=,ppid='],{encoding:'utf8',timeout:15000}).split('\n').flatMap(line=>{const m=/^\s*(\d+)\s+(\d+)\s*$/.exec(line);return m?[{pid:Number(m[1]),parent:Number(m[2])}]:[];});
  const pids=new Set([owned.pid]);let changed=true;
  while(changed){changed=false;for(const row of rows)if(pids.has(row.parent)&&!pids.has(row.pid)){pids.add(row.pid);changed=true;}}
  const ports=listeners();
  return [...pids].map(pid=>({pid,ports:[...new Set([...(pid===owned.pid?owned.ports:[]),...ports.filter(row=>row.pid===pid).map(row=>row.port)])]}));
  } catch(error){return [{...owned,inspectionError:error}];}
}
async function verifyStopped(owned) {
  if (!owned) return;
  let alive = true;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      process.kill(owned.pid, 0);
    } catch (error) {
      if (process.platform === "win32" && error.code === "EPERM") {
        // A denied signal probe is inconclusive; require independent process-table absence.
        const found = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
          `$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process -Filter 'ProcessId = ${Number(owned.pid)}').Count`,
        ], { encoding: "utf8", timeout: 15000 }).trim();
        assert.match(found, /^\d+$/, "Inspect the invalid Windows process-table response before claiming cleanup.");
        if (Number(found) !== 0) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          continue;
        }
      } else if (error.code !== "ESRCH") throw error;
      alive = false;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(
    alive,
    false,
    `Owned process ${owned.pid} is still alive; inspect its shutdown before continuing.`,
  );
  const remaining = listeners().filter(
    (row) => row.pid === owned.pid || owned.ports.includes(row.port),
  );
  assert.equal(
    remaining.length,
    0,
    "A captured fixture listener remains occupied; inspect ownership, never stop unrelated processes.",
  );
  if(owned.inspectionError)throw Error('Could not inspect owned child processes. Inspect the native process-table failure before claiming cleanup.',{cause:owned.inspectionError});
  console.log(
    `PASS: owned desktop process exited and ${owned.ports.length} captured listeners are absent.`,
  );
}
module.exports = { capture, captureTree, verifyStopped };
