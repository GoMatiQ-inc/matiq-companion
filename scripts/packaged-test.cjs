const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const candidates =
  process.platform === "darwin"
    ? [`mac-${process.arch}`, "mac"].map((folder) =>
        path.resolve(
          "dist",
          folder,
          "MatiQ Companion.app/Contents/MacOS/MatiQ Companion",
        ),
      )
    : [path.resolve("dist/win-unpacked/MatiQ Companion.exe")];
const executable = candidates.find((file) => fs.existsSync(file));
if (!executable)
  throw Error(
    "Build the native application before running packaged qualification.",
  );
const result = spawnSync(
  process.execPath,
  [path.join(__dirname, "desktop-test.cjs")],
  {
    env: { ...process.env, COMPANION_EXECUTABLE_PATH: executable },
    stdio: "inherit",
    timeout: 120000,
  },
);
if (result.error) throw result.error;
if (result.status !== 0)
  throw Error(
    `Packaged desktop qualification failed (${result.status ?? result.signal}).`,
  );
console.log(
  "PASS: packaged native application completed the real desktop/inference workflow.",
);
