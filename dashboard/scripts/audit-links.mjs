#!/usr/bin/env node
// Depth check D2: every text node containing a digit inside <main> must sit inside
// <a class="num" href="..."> . Fetches DASHBOARD_URL (default http://localhost:3100).
// Exit 1 and print offenders, or exit 0 and print "audit-links: 0 unlinked".

const base = (process.env.DASHBOARD_URL || "http://localhost:3100").replace(/\/$/, "");

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const SKIP = new Set(["script", "style", "template", "noscript"]);

function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function attrs(tag) {
  const out = {};
  const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g;
  let m;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

function isNumAnchor(name, a) {
  if (name !== "a") return false;
  const cls = (a.class || "").split(/\s+/);
  return cls.includes("num") && typeof a.href === "string" && a.href.length > 0;
}

export function audit(html) {
  const open = html.search(/<main[\s>]/i);
  if (open < 0) return { ok: false, offenders: [{ path: "(document)", text: "no <main> element" }] };
  const close = html.search(/<\/main\s*>/i);
  const body = html.slice(open, close < 0 ? html.length : close + 7);

  const stack = []; // {name, num}
  const offenders = [];
  let numDepth = 0;
  let skipDepth = 0;
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(body))) {
    if (m[0].startsWith("<!--")) continue;
    if (m[1]) { // closing tag
      const name = m[1].toLowerCase();
      for (let i = stack.length - 1; i >= 0; i--) {
        const e = stack.pop();
        if (e.num) numDepth--;
        if (SKIP.has(e.name)) skipDepth--;
        if (e.name === name) break;
      }
      continue;
    }
    if (m[2]) { // opening tag
      const name = m[2].toLowerCase();
      const raw = m[3] || "";
      const selfClose = /\/\s*$/.test(raw) || VOID.has(name);
      if (selfClose) continue;
      const num = isNumAnchor(name, attrs(raw.replace(/\/\s*$/, "")));
      stack.push({ name, num });
      if (num) numDepth++;
      if (SKIP.has(name)) skipDepth++;
      continue;
    }
    const text = decode(m[4]);
    if (skipDepth > 0 || numDepth > 0 || !/\d/.test(text)) continue;
    offenders.push({ path: stack.map((e) => e.name).join(" > ") || "(main)", text: text.trim().slice(0, 80) });
  }
  return { ok: offenders.length === 0, offenders };
}

async function main() {
  const url = `${base}/`;
  let html;
  try {
    const res = await fetch(url, { headers: { accept: "text/html" } });
    if (!res.ok) throw new Error(`http ${res.status}`);
    html = await res.text();
  } catch (e) {
    console.error(`audit-links: cannot fetch ${url}: ${e.message}`);
    process.exit(1);
  }
  const { ok, offenders } = audit(html);
  if (!ok) {
    console.error(`audit-links: ${offenders.length} unlinked`);
    for (const o of offenders) console.error(`  ${o.path}: "${o.text}"`);
    process.exit(1);
  }
  console.log("audit-links: 0 unlinked");
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) main();
