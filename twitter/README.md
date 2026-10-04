# X(Twitter) 自動投稿キュー（GSS → Buffer無料枠 → X）

> **注意**: ユーザーのPC側に既存の同種パイプライン（`podcast-x/` + `gas/relayToBufferPodcast.gs`、毎晩23:30にBufferへ積む）があると後から判明。
> このフォルダはそれを見る前に作った単体版で、**重複している可能性が高い**。既存側のコードを確認でき次第、統合または破棄する。

1日5本を、依頼なしで積み続ける仕組み。

| 種別 | 中身 | 入り方 |
|---|---|---|
| `short` | ショート動画 | YouTube RSSから自動検知（`/shorts/ID`で判定） |
| `new` | 新着告知（YouTube・note・Spotify） | 各RSSから自動検知 |
| `tips` | ためになる投稿 | 手書き行を queue に足す。尽きたら60日経った分を再投入（投稿案は未作成） |

毎日 6:00 に `daily()` が走り、1日分（既定5本: 新着≤2 / ショート≤2 / 残りtips）をBufferのキューに積む。
Bufferの無料枠は予約10本までなので、直近48時間の積み本数で上限ガードしている。

## セットアップ（初回のみ・約15分）

1. **Buffer**: Xを連携し、投稿時刻を1日5枠に設定（Publishing Schedule）。APIキーを発行し、チャンネルIDを控える。
2. **スプレッドシート**を新規作成 → 拡張機能 → Apps Script に `gas/Code.gs` を貼る。
3. Apps Scriptの「プロジェクトの設定 → スクリプトプロパティ」に `BUFFER_TOKEN` を追加（**シートやGitには書かない**）。
4. `setup()` を一度実行 → `config` / `queue` シートと毎朝トリガーが作られる。
5. `config` シートに `youtube_channel_id` / `podcast_rss` / `buffer_channel_id` を記入。
6. `daily()` を手動実行して動作確認。初回のRSS取込分は過去記事が溢れないよう `取込済(初回)` になり投稿されない。

## 運用

- 手書き投稿を足す: queueに行を追加（`type`=tips、`text`に本文、`url`は空でも可、`status`=待機）。
- 投稿を止めたい行は `status` を `停止` に。エラー行は `note` に理由が出る。

## 要確認（私の環境ではBufferのドキュメントを開けず未検証）

- `bufferCreatePost_()` のBuffer GraphQL API（mutation名・入力項目・無料枠で使えるか）は記憶ベース。違っていたらこの関数だけ直す。
  使えない場合の代替: Buffer側でRSSフィード取込（プランによる）か、queueをRSS/CSVで公開してBuffer or Zapier連携。
- 通常のBuffer無料枠はチャンネル3つ・予約10本まで。
- Xの本文は重み付け280（全角2・URL23）で自動で切り詰める。
