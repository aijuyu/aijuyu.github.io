# dist/ を Cloudflare へ配る。`npm run deploy` から呼ばれる。
#
# ── なぜ直接 wrangler deploy しないか ──────────────────
# Node 24 は、日本語を含むパスでファイルを触ると libuv のアサーションに落ちて
# プロセスごと死ぬ（詳しくは scripts/clean.mjs）。wrangler も例外ではなく、
# このプロジェクト（C:\...\DXウェブサイト\landing）で走らせると
# 何も出さずに終了コード -1073740791 で落ちる。
#
# **エラーが1行も出ないので「配ったつもり」になる。** 実際そうなっていた。
# 2026-09-23、ライブは9:02のまま止まっていて、しばらく気づかなかった。
#
# Nodeで書くとこのスクリプト自身が同じ穴に落ちるので、
# ファイルの移動はPowerShell（Windowsネイティブ）にやらせる。
#
# ── 何をしているか ──────────────────────────────
# ASCIIだけのパスへ dist と wrangler.jsonc を寄せて、そこから wrangler を呼ぶ。
# node_modules はジャンクションで渡す（実体はコピーしない）。
#
# Node 22 に戻したら不要になる（.nvmrc に 22 と書いてある）。それまでは消さない。

$ErrorActionPreference = "Stop"

$root  = (Get-Location).Path
$dist  = Join-Path $root "dist"
$stage = Join-Path $env:LOCALAPPDATA "ikyokunosoto-deploy"

if (-not (Test-Path $dist)) {
    Write-Error "dist/ が無い。先に npm run build"
    exit 1
}

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $stage | Out-Null

Copy-Item $dist (Join-Path $stage "dist") -Recurse -Force
Copy-Item (Join-Path $root "wrangler.jsonc") (Join-Path $stage "wrangler.jsonc") -Force

$link = Join-Path $stage "node_modules"
cmd /c mklink /J "$link" "$(Join-Path $root 'node_modules')" | Out-Null

$n  = (Get-ChildItem (Join-Path $stage "dist") -Recurse -File | Measure-Object).Count
$mb = [math]::Round((Get-ChildItem (Join-Path $stage "dist") -Recurse -File | Measure-Object Length -Sum).Sum / 1MB)
Write-Output "[deploy] $n ファイル / $mb MB を $stage から配ります"

Push-Location $stage
try {
    & node (Join-Path $link "wrangler\bin\wrangler.js") deploy
    $code = $LASTEXITCODE
} finally {
    Pop-Location
}

if ($code -ne 0) {
    Write-Error "wrangler が失敗しました (exit=$code)"
    exit $code
}
Write-Output "[deploy] 完了"
