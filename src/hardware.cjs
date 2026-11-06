const os = require("node:os");
const fs = require("node:fs/promises");
function recommend(hardware, models) {
  const suitable = models.filter(
    (m) => hardware.memoryBytes >= m.minRamGiB * 1024 ** 3,
  );
  return suitable.at(-1)?.id || null;
}
async function hardware(directory) {
  const disk = await fs.statfs(directory);
  return {
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus()[0]?.model || "Unknown",
    cores: os.availableParallelism(),
    memoryBytes: os.totalmem(),
    freeMemoryBytes: os.freemem(),
    freeDiskBytes: Number(disk.bavail) * Number(disk.bsize),
    gpu: "Detected by the inference runtime when a model is loaded; RAM recommendations are conservative, not benchmarks.",
  };
}
module.exports = { hardware, recommend };
