// サイトの記事・公開済みエピソードから「ためになる投稿(tips)」の初期ストックを作る。
// 出力: twitter/seed-tips.csv  → スプレッドシートの queue シートへ貼り付け/インポートする。
// 実行: node scripts/twitter-seed.mjs
import fs from "node:fs";
import path from "node:path";

const SITE = "https://ikyokunosoto.com";
const ROOT = process.cwd();
const unescape = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const csv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

const rows = [];

// 記事: og:description（直接回答型に整えてある）をそのままフックに使う
const dir = path.join(ROOT, "src", "articles-src");
for (const f of fs.readdirSync(dir).sort()) {
  if (!f.endsWith(".html") || f === "index.html") continue;
  const html = fs.readFileSync(path.join(dir, f), "utf-8");
  const desc = html.match(/<meta property="og:description" content="([\s\S]*?)">/)?.[1];
  if (!desc) continue;
  rows.push({ type: "tips", text: unescape(desc).trim(), url: `${SITE}/articles/${f}`, source: `article:${f}` });
}

// エピソード: 公開済みのlead文＋サイト記事URL
const eps = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "episodes.json"), "utf-8"));
for (const e of eps) {
  if (e.privacy !== "public" || !e.lead) continue;
  if (!fs.existsSync(path.join(ROOT, "src", "episodes-md", e.site_md || `ep${e.ep}.md`))) continue;
  rows.push({ type: "tips", text: e.lead.trim(), url: `${SITE}/episodes/ep${e.ep}.html`, source: `episode:${e.ep}` });
}

const header = ["id", "type", "text", "url", "status", "source", "pushed_at", "buffer_id", "last_posted", "note"];
const lines = [header.join(",")];
rows.forEach((r, i) => {
  lines.push([`seed-${String(i + 1).padStart(3, "0")}`, r.type, r.text, r.url, "待機", r.source, "", "", "", ""].map(csv).join(","));
});
fs.writeFileSync(path.join(ROOT, "twitter", "seed-tips.csv"), "﻿" + lines.join("\n") + "\n");
console.log(`seed-tips.csv: ${rows.length} 件`);
