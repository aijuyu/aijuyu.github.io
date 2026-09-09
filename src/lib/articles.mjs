// 記事HTMLを「共通の外枠」と「ページ固有部分」に分解する。
// 本文は一切変換せず、元のHTMLをそのまま持ち回る。
// Markdown化すると41本の独自マークアップを壊すリスクが高く、得るものが少ない。
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src", "articles-src");

const pick = (html, re) => {
  const m = html.match(re);
  return m ? m[1] : null;
};

export function parseArticle(html) {
  const head = html.match(/^[\s\S]*?<\/head>/)[0];

  // headに差し込まれている構造化データ（FAQPageなど）。持つのは今のところ1本だけ
  const headExtra = (head.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) || []).join("\n");

  // 本文は </nav> と <aside class="sidebar"> の間
  const start = html.indexOf("</nav>") + "</nav>".length;
  const end = html.indexOf('<aside class="sidebar">');
  if (start < "</nav>".length || end < 0) throw new Error("本文の境界を特定できない");
  const body = html.slice(start, end);

  // サイドバーとfooterの間に、本文側で開いたラッパの閉じタグが入る。
  // ページによって構造が違う（articles/index.html は list-hero が先に来る）ので、
  // 開きタグを剥がす方式は取らず、閉じタグをそのまま持ち回る。
  // 裸の </div> をテンプレートに書くとAstroのパーサに捨てられるため、
  // これは set:html で生のまま出す必要がある。
  const asideEnd = html.indexOf("</aside>") + "</aside>".length;
  const footerStart = html.indexOf("<footer>");
  if (asideEnd < "</aside>".length || footerStart < 0) throw new Error("末尾の境界を特定できない");
  const tail = html.slice(asideEnd, footerStart);

  return {
    title: pick(head, /<title>([\s\S]*?)<\/title>/),
    desc: pick(head, /<meta name="description" content="([\s\S]*?)">/),
    canonical: pick(head, /<link rel="canonical" href="([\s\S]*?)">/),
    ogTitle: pick(head, /<meta property="og:title" content="([\s\S]*?)">/),
    ogDesc: pick(head, /<meta property="og:description" content="([\s\S]*?)">/),
    ogType: pick(head, /<meta property="og:type" content="([\s\S]*?)">/),
    ogImage: pick(head, /<meta property="og:image" content="([\s\S]*?)">/),
    twImage: pick(head, /<meta name="twitter:image" content="([\s\S]*?)">/),
    headExtra,
    body,
    tail,
  };
}

export function loadArticles() {
  return fs.readdirSync(SRC_DIR)
    .filter((f) => f.endsWith(".html"))
    .sort()
    .map((f) => ({
      slug: f.replace(/\.html$/, ""),
      ...parseArticle(fs.readFileSync(path.join(SRC_DIR, f), "utf-8")),
    }));
}
