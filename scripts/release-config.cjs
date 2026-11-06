module.exports = require("./signing-config.cjs").signedConfig(
  process.platform,
  process.env,
);
