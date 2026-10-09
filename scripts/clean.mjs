// astro build の前に dist/ を片づける。
//
// ── なぜ要るか ────────────────────────────────────
// Node 24 は、**パスに日本語が入っていると再帰削除でプロセスごと落ちる。**
//
//   Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76
//   → 終了コード -1073740791 (0xC0000409)
//
// JSの例外ではなくabortなので、エラーは1行も出ない。Astroは
// 「Collecting build info...」の直後に黙って死ぬ。実測:
//
//   C:\...\Temp\...\rm_ascii          → 消える
//   C:\Users\user\Desktop\rm_ascii    → 消える
//   C:\...\Temp\...\rm_日本語テスト    → 落ちる
//   C:\Users\user\Desktop\rm_日本語     → 落ちる
//
// このプロジェクトは C:\Users\user\Desktop\DXウェブサイト\ にあるので、
// dist/ が既にある状態で建てると必ず踏む。初回だけ通るのはそのため。
//
// ── 何をしているか ──────────────────────────────
// 日本語パスのまま消さない。ASCIIだけのtempへ rename してから消す。
// renameは同じボリューム内のエントリ名の付け替えなので、この不具合を踏まない。
//
// 本当の直し方は Node 22 に戻すこと（.nvmrc に 22 と書いてある）。
// **戻すまでこのファイルを消さないこと。** 2回目のビルドから再発する。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dist = path.join(process.cwd(), "dist");

if (!fs.existsSync(dist)) {
  console.log("[clean] dist/ は無い");
  process.exit(0);
}

// os.tmpdir() 自体に日本語が混ざる環境もあるので、混ざっていたら C:\ 直下へ逃がす
const ASCII = /^[\x20-\x7E]*$/;
const tmpRoot = ASCII.test(os.tmpdir()) ? os.tmpdir() : path.parse(process.cwd()).root;
const grave = path.join(tmpRoot, `astro-dist-${process.pid}-${Date.now()}`);

fs.renameSync(dist, grave);
try {
  fs.rmSync(grave, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  console.log("[clean] dist/ を消した");
} catch (e) {
  // 消し損ねてもビルドは続けてよい。dist/ はもう退いている
  console.log(`[clean] dist/ は退けたが消せなかった: ${grave}（${e.code}）`);
}
