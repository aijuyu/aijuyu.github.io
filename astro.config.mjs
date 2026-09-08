import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// 既存URLを1文字も変えないことが最優先。
// format:"file" にしないと /articles/foo.html が /articles/foo/ になり、
// ドメイン移行の直後に2度目のURL変更を起こしてしまう。
export default defineConfig({
  site: "https://ikyokunosoto.com",
  trailingSlash: "ignore",
  build: {
    format: "file",
    assets: "_assets",
  },
  integrations: [sitemap()],
});
