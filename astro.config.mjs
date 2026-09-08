import { defineConfig } from "astro/config";

// 既存URLを1文字も変えないことが最優先。
// format:"file" にしないと /episodes/ep1-1.html が /episodes/ep1-1/ になり、
// ドメイン移行の直後に2度目のURL変更を起こしてしまう。
//
// sitemapは移行が全ページ終わるまで public/sitemap.xml の手管理を続ける。
// @astrojs/sitemap を今入れるとAstro化済みのページしか載らない。
export default defineConfig({
  site: "https://ikyokunosoto.com",
  trailingSlash: "ignore",
  build: {
    format: "file",
    assets: "_assets",
  },
});
