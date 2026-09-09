// astro build のあとに走る。
//  1. _redirects を dist へ置く（Astroは public/ のアンダースコア始まりを運ばない）
//  2. 拡張子なしURL → .html の301を、実在するページから生成して足す
//
// GitHub Pages時代は /articles/foo と /articles/foo.html の両方が200だった。
// Cloudflareの html_handling:"none" では拡張子なしが404になるため、
// 過去にその形でインデックスされたURLを301で受け直す。
// プレースホルダ記法(:slug)は .html 付きのURLまで拾ってしまうので使わない。
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");

const base = fs.readFileSync(path.join(ROOT, "src", "_redirects"), "utf-8").trimEnd();

const rules = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { walk(full); continue; }
    if (!e.name.endsWith(".html") || e.name === "index.html") continue;
    const url = "/" + path.relative(DIST, full).split(path.sep).join("/");
    rules.push(`${url.slice(0, -".html".length)}  ${url}  301`);
  }
};
walk(DIST);
rules.sort();

const out = [
  base,
  "",
  "# ここから下は postbuild.mjs が生成。拡張子なしURLを .html へ301で寄せる。",
  ...rules,
  "",
].join("\n");

fs.writeFileSync(path.join(DIST, "_redirects"), out);
console.log(`_redirects: 拡張子なしURLの301を ${rules.length} 件生成`);
