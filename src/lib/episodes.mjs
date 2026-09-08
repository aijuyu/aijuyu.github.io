// エピソードのデータ源をまとめる層。
// build_episodes.py と同じ入力（episodes.json + サイト用md）を読み、
// ページ生成に必要な形へ整えて返す。
import fs from "node:fs";
import path from "node:path";
import { parseSiteMd, blocksToHtml, compareEp, unescapeHtml } from "./render.mjs";

// ビルド時はこのモジュールが dist/ 配下から実行されるため、
// import.meta.url を基準にすると解決先がずれる。Astroは常に
// プロジェクトルートを cwd にして走るので、そちらを基準にする。
const ROOT = process.cwd();
const EP_JSON = path.join(ROOT, "public", "data", "episodes.json");
const MD_DIR = path.join(ROOT, "src", "episodes-md");
const ARTICLES_DIR = path.join(ROOT, "public", "articles");

export const SITE = "https://ikyokunosoto.com";
export const MEMBERSHIP_URL = "https://note.com/aiju_yu/membership";

// related のファイル名 → リンクに出す見出し
let _articleTitles = null;
export function articleTitle(href) {
  if (!_articleTitles) {
    _articleTitles = {};
    for (const name of fs.readdirSync(ARTICLES_DIR)) {
      if (!name.endsWith(".html") || name === "index.html") continue;
      const text = fs.readFileSync(path.join(ARTICLES_DIR, name), "utf-8");
      let m = text.match(/<meta property="og:title" content="(.*?)"/);
      if (!m) m = text.match(/<title>([\s\S]*?)<\/title>/);
      if (m) {
        const title = unescapeHtml(m[1]).trim();
        _articleTitles[name] = title.split(/[｜|]/)[0].trim();
      }
    }
  }
  return _articleTitles[href] ?? href;
}

export function loadEpisodes() {
  const records = JSON.parse(fs.readFileSync(EP_JSON, "utf-8"));

  const withBody = records
    .map((rec) => {
      const mdName = rec.site_md || `ep${rec.ep}.md`;
      const mdPath = path.join(MD_DIR, mdName);
      if (!fs.existsSync(mdPath)) return null; // 本文が無い回はページを作らない
      const { blocks } = parseSiteMd(fs.readFileSync(mdPath, "utf-8"));
      return { ...rec, blocks, bodyHtml: blocksToHtml(blocks) };
    })
    .filter(Boolean)
    .sort((a, b) => compareEp(a.ep, b.ep));

  // 前後のリンクは本文があるものだけで繋ぐ
  return withBody.map((rec, i) => ({
    ...rec,
    prev: withBody[i - 1] ?? null,
    next: withBody[i + 1] ?? null,
  }));
}
