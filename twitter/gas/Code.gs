/**
 * X(Twitter)自動投稿キュー: GSS → Buffer(無料枠) → X
 *
 * 毎日1回(トリガー)実行すると:
 *   1. YouTube / note / Spotify のRSSから新着を拾い queue シートへ追記
 *      （YouTubeはショートか通常動画かも自動判定）
 *   2. 「待機」行から1日分(DAILY_TARGET本)を選び、Buffer のキューへ積む
 *   3. 待機が尽きたら、古い tips を再投入（evergreen循環）
 *
 * シート構成は README.md を参照。設定は config シート、秘密は スクリプトプロパティ。
 */

const QUEUE = 'queue';
const CONFIG = 'config';
const COLS = ['id', 'type', 'text', 'url', 'status', 'source', 'pushed_at', 'buffer_id', 'last_posted', 'note'];
const TYPES = { short: 'short', new: 'new', tips: 'tips' };
const BUFFER_FREE_QUEUE_LIMIT = 10; // 無料枠: 1チャンネル10本まで予約可
const TWEET_LIMIT = 280;            // 重み付け(全角=2, URL=23)

// ───────── エントリポイント（トリガーにはこれを登録） ─────────
function daily() {
  ingestFeeds();
  pushToBuffer();
}

// ───────── 1. 新着取り込み ─────────
function ingestFeeds() {
  const cfg = readConfig_();
  const sheet = sheet_(QUEUE);
  const known = new Set(readRows_(sheet).map(r => r.url));
  const add = [];

  // YouTube（通常動画 / ショート）
  if (cfg.youtube_channel_id) {
    for (const e of fetchFeed_('https://www.youtube.com/feeds/videos.xml?channel_id=' + cfg.youtube_channel_id)) {
      const id = (e.link.match(/[?&]v=([\w-]+)/) || [])[1];
      if (!id) continue;
      const isShort = isShort_(id);
      const url = isShort ? 'https://www.youtube.com/shorts/' + id : 'https://youtu.be/' + id;
      if (known.has(url) || known.has('https://youtu.be/' + id)) continue;
      add.push(newRow_(isShort ? TYPES.short : TYPES.new, e.title, url, 'youtube:' + id, cfg, isShort ? 'short' : 'youtube'));
      known.add(url);
    }
  }
  // note
  if (cfg.note_rss) {
    for (const e of fetchFeed_(cfg.note_rss)) {
      if (known.has(e.link)) continue;
      add.push(newRow_(TYPES.new, e.title, e.link, 'note', cfg, 'note'));
      known.add(e.link);
    }
  }
  // Spotify（Podcastの配信元RSS。spotify.com の show URL は RSS ではないので配信元のRSSを入れる）
  if (cfg.podcast_rss) {
    for (const e of fetchFeed_(cfg.podcast_rss)) {
      const url = cfg.spotify_show_url || e.link; // 告知にはSpotifyのURLを使う
      const key = 'podcast:' + e.guid;
      if (known.has(key)) continue;
      add.push(newRow_(TYPES.new, e.title, url, key, cfg, 'spotify'));
      known.add(key);
    }
  }
  // 初回は過去分が一気に入って告知が溢れるため、初回(queueが空)は「送信済」扱いで取り込む
  if (add.length) {
    const firstRun = readRows_(sheet).length === 0;
    if (firstRun) add.forEach(r => (r.status = '取込済(初回)'));
    appendRows_(sheet, add);
  }
}

// ───────── 2. Bufferへ積む ─────────
function pushToBuffer() {
  const cfg = readConfig_();
  const sheet = sheet_(QUEUE);
  const rows = readRows_(sheet);
  const target = Number(cfg.daily_target || 5);
  const now = new Date();

  // 無料枠の上限ガード: 直近48時間に積んだ本数をBuffer側の残数の目安にする
  const since = new Date(now.getTime() - 48 * 3600 * 1000);
  const recentlyPushed = rows.filter(r => r.status === 'Buffer済' && r.pushed_at && new Date(r.pushed_at) > since).length;
  const room = Math.min(target, BUFFER_FREE_QUEUE_LIMIT - recentlyPushed);
  if (room <= 0) { console.log('Bufferキューが満杯のため今日は積まない'); return; }

  // 待機tipsが少なければ、60日以上前に投稿したtipsを再投入
  recycleTips_(sheet, rows, now);

  const picks = pickForToday_(readRows_(sheet), room, cfg);
  const token = PropertiesService.getScriptProperties().getProperty('BUFFER_TOKEN');
  const channelId = cfg.buffer_channel_id;
  if (!token || !channelId) throw new Error('BUFFER_TOKEN(スクリプトプロパティ) と buffer_channel_id(config) が必要');

  for (const r of picks) {
    const text = composeText_(r, cfg);
    try {
      const bufferId = bufferCreatePost_(token, channelId, text);
      update_(sheet, r._row, { status: 'Buffer済', pushed_at: now, buffer_id: bufferId, last_posted: now, note: '' });
    } catch (err) {
      update_(sheet, r._row, { status: 'エラー', note: String(err).slice(0, 200) });
    }
  }
}

// 1日の配分: 新着告知を最大2、ショート最大2、残りをtips。足りない枠は他種別で埋める
function pickForToday_(rows, n, cfg) {
  const wait = t => rows.filter(r => r.type === t && r.status === '待機');
  const quota = { new: Math.min(2, n), short: 2, tips: 1 };
  const picks = [];
  const take = (list, k) => { while (k-- > 0 && list.length) picks.push(list.shift()); };
  const lists = { new: wait('new'), short: wait('short'), tips: wait('tips') };
  take(lists.new, quota.new);
  take(lists.short, quota.short);
  take(lists.tips, Math.max(quota.tips, n - picks.length));
  // まだ余っていれば残りの種別から
  for (const t of ['new', 'short', 'tips']) take(lists[t], n - picks.length);
  return picks.slice(0, n);
}

function recycleTips_(sheet, rows, now) {
  const waiting = rows.filter(r => r.type === 'tips' && r.status === '待機').length;
  if (waiting >= 10) return;
  const cutoff = new Date(now.getTime() - 60 * 24 * 3600 * 1000);
  rows.filter(r => r.type === 'tips' && r.status === 'Buffer済' && r.last_posted && new Date(r.last_posted) < cutoff)
      .sort((a, b) => new Date(a.last_posted) - new Date(b.last_posted))
      .slice(0, 20)
      .forEach(r => update_(sheet, r._row, { status: '待機' }));
}

// ───────── 文面生成 ─────────
function composeText_(r, cfg) {
  const tags = (cfg.hashtags || '').trim();
  let head;
  if (r.type === TYPES.short) head = '【ショート動画】' + r.text;
  else if (r.type === TYPES.new) head = '【新着】' + r.text;
  else head = r.text;
  // 「手動で書いた本文(urlが空)」はそのまま。それ以外は URL を末尾に付ける
  const tail = (r.url ? '\n' + r.url : '') + (tags && r.type !== TYPES.tips ? '\n' + tags : '');
  // 重み付け長で切り詰め
  const reserved = weight_(tail.replace(/https?:\/\/\S+/g, 'x'.repeat(23)));
  let body = head;
  while (weight_(body) + reserved > TWEET_LIMIT && body.length > 1) body = body.slice(0, -2) + '…';
  return body + tail;
}
function weight_(s) {
  let w = 0;
  for (const ch of s) w += ch.charCodeAt(0) <= 0x10ff || (ch.charCodeAt(0) >= 0x2000 && ch.charCodeAt(0) <= 0x200d) ? 1 : 2;
  return w;
}

// ───────── Buffer ─────────
// 注意: Bufferの新API(GraphQL, https://api.buffer.com)を想定。仕様が変わっていたら
// この関数だけ直せばよい。mutation名・入力項目は公式ドキュメントで要確認。
function bufferCreatePost_(token, channelId, text) {
  const query = 'mutation($input: CreatePostInput!){ createPost(input:$input){ ... on PostActionSuccess { post { id } } ... on MutationError { message } } }';
  const res = UrlFetchApp.fetch('https://api.buffer.com', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ query, variables: { input: { text, channelId, schedulingType: 'automatic', mode: 'addToQueue' } } }),
    muteHttpExceptions: true,
  });
  const body = JSON.parse(res.getContentText());
  const out = body.data && body.data.createPost;
  if (body.errors || !out || out.message) throw new Error((body.errors && body.errors[0].message) || (out && out.message) || res.getContentText());
  return out.post.id;
}

// ───────── RSS / 判定 ─────────
function fetchFeed_(url) {
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) { console.warn('feed失敗: ' + url); return []; }
  const root = XmlService.parse(res.getContentText()).getRootElement();
  const out = [];
  const text = (el, name) => { const c = el.getChildren().filter(x => x.getName() === name)[0]; return c ? c.getText() : ''; };
  const atom = root.getName() === 'feed';
  const items = atom ? root.getChildren().filter(x => x.getName() === 'entry')
                     : root.getChildren('channel')[0].getChildren('item');
  items.slice(0, 15).forEach(it => {
    let link = '';
    if (atom) { const l = it.getChildren().filter(x => x.getName() === 'link')[0]; link = l ? l.getAttribute('href').getValue() : ''; }
    else link = text(it, 'link');
    out.push({ title: text(it, 'title').trim(), link, guid: text(it, atom ? 'id' : 'guid') || link });
  });
  return out;
}
// /shorts/ID は、ショートなら200、通常動画なら303でwatchへ飛ぶ
function isShort_(id) {
  const res = UrlFetchApp.fetch('https://www.youtube.com/shorts/' + id, { followRedirects: false, muteHttpExceptions: true });
  return res.getResponseCode() === 200;
}

// ───────── シート入出力 ─────────
function newRow_(type, text, url, source, cfg, label) {
  return { id: Utilities.getUuid().slice(0, 8), type, text, url, status: '待機', source, pushed_at: '', buffer_id: '', last_posted: '', note: '' };
}
function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(name);
  if (!s) { s = ss.insertSheet(name); if (name === QUEUE) s.appendRow(COLS); }
  return s;
}
function readRows_(sheet) {
  const v = sheet.getDataRange().getValues();
  if (v.length < 2) return [];
  const h = v[0];
  return v.slice(1).map((row, i) => { const o = { _row: i + 2 }; h.forEach((k, j) => (o[k] = row[j])); return o; });
}
function appendRows_(sheet, rows) {
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, COLS.length).setValues(rows.map(r => COLS.map(c => r[c] === undefined ? '' : r[c])));
}
function update_(sheet, rowNum, patch) {
  Object.keys(patch).forEach(k => sheet.getRange(rowNum, COLS.indexOf(k) + 1).setValue(patch[k]));
}
function readConfig_() {
  const v = sheet_(CONFIG).getDataRange().getValues();
  const cfg = {};
  v.forEach(r => { if (r[0]) cfg[String(r[0]).trim()] = String(r[1]).trim(); });
  return cfg;
}

// 初回セットアップ: config シートの雛形と、毎朝のトリガーを作る
function setup() {
  const c = sheet_(CONFIG);
  if (c.getLastRow() === 0) {
    c.getRange(1, 1, 8, 3).setValues([
      ['youtube_channel_id', '', 'UCから始まるチャンネルID'],
      ['note_rss', 'https://note.com/aiju_yu/rss', ''],
      ['podcast_rss', '', 'Podcast配信元のRSS（Spotify for Creators等）'],
      ['spotify_show_url', 'https://open.spotify.com/show/6P57D2wQTwfAClUpT6XRQg', '新着告知に使うURL'],
      ['buffer_channel_id', '', 'Bufferで連携したXのチャンネルID'],
      ['daily_target', '5', '1日に積む本数'],
      ['hashtags', '', '新着/ショートの末尾に付けるタグ（任意）'],
      ['', '', ''],
    ]);
  }
  sheet_(QUEUE);
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'daily').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('daily').timeBased().everyDays(1).atHour(6).create();
}
