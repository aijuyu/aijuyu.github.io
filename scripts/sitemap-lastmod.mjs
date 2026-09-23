// public/sitemap.xml の lastmod を、各URLの元ファイルの最終コミット日に揃える。
// 手管理のsitemapは日付が古いまま取り残されやすく、Googleの再クロール優先度が
// 下がる。記事を足したあとに実行する。
import { execSync } from "node:child_process";
import fs from "node:fs";

const SITEMAP = "public/sitemap.xml";

const sourceOf = (loc) => {
  const path = loc.replace("https://ikyokunosoto.com", "");
  if (path === "/") return "public/index.html";
  if (path === "/articles/") return "src/articles-src/index.html";
  if (path === "/episodes/") return "public/episodes/index.html";
  const article = path.match(/^\/articles\/(.+)\.html$/);
  if (article) return `src/articles-src/${article[1]}.html`;
  const episode = path.match(/^\/episodes\/(.+)\.html$/);
  if (episode) return `src/episodes-md/${episode[1]}.md`;
  return null;
};

const lastCommit = (file) =>
  execSync(`git log -1 --format=%ad --date=short -- "${file}"`).toString().trim();

let xml = fs.readFileSync(SITEMAP, "utf-8");
let updated = 0;
xml = xml.replace(
  /<loc>(.*?)<\/loc>(\s*)<lastmod>(.*?)<\/lastmod>/g,
  (whole, loc, gap, current) => {
    const src = sourceOf(loc);
    if (!src || !fs.existsSync(src)) {
      console.warn(`  元ファイル不明のため据え置き: ${loc}`);
      return whole;
    }
    const date = lastCommit(src);
    if (!date || date === current) return whole;
    updated++;
    return `<loc>${loc}</loc>${gap}<lastmod>${date}</lastmod>`;
  },
);
fs.writeFileSync(SITEMAP, xml);
console.log(`lastmod を更新: ${updated} 件`);
