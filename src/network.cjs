const https = require("node:https");
const dns = require("node:dns").promises;
const net = require("node:net");
function publicIP(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && [0, 168].includes(b)) ||
      (a === 198 && [18, 19, 51].includes(b)) ||
      (a === 203 && b === 0) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    return /^2[0-9a-f]{3}:/i.test(ip) && !/^2001:(?:db8|0):/i.test(ip);
  }
  return false;
}
async function page(url, redirects = 0) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443")
  )
    throw Error(
      "Web tools require public HTTPS URLs without credentials or custom ports.",
    );
  if (redirects > 3) throw Error("This page redirects too many times.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addresses = await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => !publicIP(a.address)))
    throw Error(
      "Web tools cannot access private, loopback or reserved networks.",
    );
  const ip = addresses[0];
  return new Promise((resolve, reject) => {
    const req = https.get(
      u,
      {
        lookup: (_h, options, cb) =>
          options.all ? cb(null, [ip]) : cb(null, ip.address, ip.family),
        headers: {
          "User-Agent": "MatiQCompanion/0.1",
          Accept: "text/html,text/plain",
        },
        timeout: 15000,
      },
      (res) => {
        if (
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location
        ) {
          res.resume();
          page(new URL(res.headers.location, u).href, redirects + 1).then(
            resolve,
            reject,
          );
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(Error(`Web request failed (${res.statusCode}).`));
          return;
        }
        if (!/text\/(html|plain)/i.test(res.headers["content-type"] || "")) {
          res.resume();
          reject(Error("This tool reads HTML or plain text pages only."));
          return;
        }
        let bytes = 0;
        const chunks = [];
        res.on("data", (c) => {
          bytes += c.length;
          if (bytes > 2 * 1024 ** 2)
            res.destroy(Error("Page exceeds the 2 MiB reading limit."));
          else chunks.push(c);
        });
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(Error("Web request timed out.")));
    req.on("error", reject);
  });
}
function decode(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
function strip(s) {
  return decode(
    s
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
}
async function search(query) {
  if (typeof query !== "string" || !query.trim() || query.length > 500)
    throw Error("Use a search query of 1–500 characters.");
  const html = await page(
    "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query),
  );
  const hits = [];
  for (const m of html.matchAll(
    /<a\b([^>]*class="[^"]*result__a[^"]*"[^>]*)>([\s\S]*?)<\/a>/g,
  )) {
    const href = /href="([^"]+)"/.exec(m[1]);
    if (!href) continue;
    const u = new URL(decode(href[1]), "https://duckduckgo.com");
    const url = u.searchParams.get("uddg") || u.href;
    if (url.startsWith("https:")) hits.push({ title: strip(m[2]), url });
    if (hits.length === 5) break;
  }
  if (!hits.length)
    throw Error(
      "Search returned no readable results or a provider challenge. Try another query later; no search was fabricated.",
    );
  return hits;
}
module.exports = { publicIP, page, strip, search };
