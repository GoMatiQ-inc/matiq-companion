async function waitFor(operation, description, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await operation();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw Error(description + " timed out. Inspect the native fixture logs.");
}
module.exports = { waitFor };
