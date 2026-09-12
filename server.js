const express = require("express");
const path = require("path");
const dns = require("dns").promises;
const net = require("net");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

const ALLOWED_HOSTS = new Set([
  "ibb.co", "www.ibb.co",
  "imgbb.com", "www.imgbb.com",
  "imgur.com", "www.imgur.com",
  "i.imgur.com",
  "i.ibb.co"
]);

function isPrivateIp(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const [a,b] = address.split(".").map(Number);
    return a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168);
  }
  if (version === 6) {
    const x = address.toLowerCase();
    return x === "::1" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80:");
  }
  return true;
}

async function validatePublicUrl(raw) {
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error("Invalid URL."); }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported.");
  }
  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    // Permit direct image hosts only when explicitly enabled through the allowlist.
    throw new Error("This domain is not supported yet. Supported domains: ImgBB and Imgur.");
  }
  const addresses = await dns.lookup(host, { all: true });
  if (addresses.some(x => isPrivateIp(x.address))) throw new Error("Unsafe destination blocked.");
  return parsed;
}

function extractMeta(html, property) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, "i");
  const match = html.match(re);
  if (match) return match[1].replace(/&amp;/g, "&");
  const reverse = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, "i");
  const reverseMatch = html.match(reverse);
  return reverseMatch ? reverseMatch[1].replace(/&amp;/g, "&") : null;
}

function normalizeImageUrl(value, baseUrl) {
  if (!value) return null;
  try {
    const u = new URL(value, baseUrl);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    return u.href;
  } catch { return null; }
}

async function resolveImage(rawUrl) {
  const url = await validatePublicUrl(rawUrl);
  const host = url.hostname.toLowerCase();

  // Direct image URLs can be returned without scraping.
  if (/\.(jpg|jpeg|png|gif|webp|avif|bmp|svg)(\?.*)?$/i.test(url.pathname)) {
    return url.href;
  }

  const response = await fetch(url.href, {
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; UniversalImageViewer/1.0)",
      "accept": "text/html,application/xhtml+xml"
    },
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) throw new Error(`Source page returned HTTP ${response.status}.`);
  const html = await response.text();

  // Most image-hosting pages expose the actual image through Open Graph metadata.
  const candidates = [
    extractMeta(html, "og:image"),
    extractMeta(html, "twitter:image"),
    extractMeta(html, "twitter:image:src")
  ].map(x => normalizeImageUrl(x, response.url)).filter(Boolean);

  // ImgBB commonly uses i.ibb.co and Imgur commonly uses i.imgur.com.
  const embedded = html.match(/https?:\/\/(?:i\.ibb\.co|i\.imgur\.com)\/[^"'\\\s<>]+/i);
  if (embedded) candidates.push(embedded[0].replace(/&amp;/g, "&"));

  const imageUrl = candidates.find(x => {
    try {
      const h = new URL(x).hostname.toLowerCase();
      return h === "i.ibb.co" || h === "i.imgur.com" || h.endsWith("imgur.com") || h.endsWith("ibb.co");
    } catch { return false; }
  });

  if (!imageUrl) throw new Error("No public image was found on this page.");
  return imageUrl;
}

app.get("/api/resolve", async (req, res) => {
  try {
    const raw = String(req.query.url || "").trim();
    if (!raw) return res.status(400).json({ success: false, error: "URL is required." });
    const imageUrl = await resolveImage(raw);
    res.json({ success: true, imageUrl });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message || "Could not resolve image." });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`Universal Image Viewer running on port ${PORT}`));