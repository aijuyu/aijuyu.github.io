// build_episodes.py の本文レンダリングをJSへ移植したもの。
// 出力HTMLが現行と食い違わないことが最優先なので、
// エスケープ規則と改行位置は Python 版に合わせてある。

const SPEAKERS = {
  "アイジュ": ["talk-aiju", "aiju.jpg"],
  "ゆー": ["talk-yu", "yu.jpg"],
};

const META_LINE = /^>\s*\S+:/;
const YT_LINE = /^https?:\/\/(?:youtu\.be|www\.youtube\.com)\/\S+$/;
const TALK_LINE = /^>\s*(アイジュ|ゆー)\s*[:：]\s*(.+)$/;
const AMAZON_LINE = /^>\s*amazon:\s*(.+?)\s*\|\s*(https?:\/\/\S+)\s*$/;
const INLINE_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

const AFFILIATE_NOTE =
  "Amazonのアソシエイトとして、医局の外で会いましょうは適格販売により収入を得ています。";

// Python の html.escape(s, quote=True) と同じ挙動
export function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export function unescapeHtml(s) {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

// 本文をエスケープしたうえで [text](url) だけリンクに戻す
export function inlineHtml(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_LINK)) {
    parts.push(esc(text.slice(last, m.index)));
    parts.push(
      `<a href="${esc(m[2])}" target="_blank" rel="noopener">${esc(m[1])}</a>`
    );
    last = m.index + m[0].length;
  }
  parts.push(esc(text.slice(last)));
  return parts.join("");
}

function talkHtml(kind, text, indent) {
  const [name, img] =
    kind === "talk-aiju" ? ["アイジュ", "aiju.jpg"] : ["ゆー", "yu.jpg"];
  const side = kind === "talk-aiju" ? "" : " right";
  return (
    `${indent}<div class="talk${side}">\n` +
    `${indent}  <div class="avatar"><img src="../${img}" alt="${name}">` +
    `<span class="name">${name}</span></div>\n` +
    `${indent}  <div class="bubble">${esc(text)}</div>\n` +
    `${indent}</div>`
  );
}

function amazonHtml(text, indent) {
  const i = text.indexOf("|");
  const title = text.slice(0, i);
  const url = text.slice(i + 1);
  return (
    `${indent}<div class="book-cta">\n` +
    `${indent}  <span class="pr">PR</span>\n` +
    `${indent}  <a href="${esc(url)}" target="_blank" ` +
    `rel="sponsored nofollow noopener">${esc(title)}</a>\n` +
    `${indent}  <span class="note">${AFFILIATE_NOTE}</span>\n` +
    `${indent}</div>`
  );
}

export function blocksToHtml(blocks, indent = "    ") {
  const out = [];
  for (const [kind, text] of blocks) {
    if (kind === "h2") {
      out.push(`${indent}<h2>${esc(text)}</h2>`);
    } else if (kind.startsWith("talk-")) {
      out.push(talkHtml(kind, text, indent));
    } else if (kind === "amazon") {
      out.push(amazonHtml(text, indent));
    } else {
      out.push(`${indent}<p>${inlineHtml(text)}</p>`);
    }
  }
  return out.join("\n");
}

// サイト用mdを {title, lead, blocks} に分解する
export function parseSiteMd(raw) {
  let lines = raw.split("\n");

  // 末尾のメタブロック（--- 以降の > 行）を切る
  let cut = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      const window = lines.slice(i + 1, i + 6);
      if (window.some((x) => META_LINE.test(x.trim()))) {
        cut = i;
        break;
      }
    }
  }
  lines = lines.slice(0, cut);

  let title = "";
  let lead = "";
  const blocks = [];
  let buf = [];

  const flush = () => {
    if (buf.length) {
      const text = buf.map((x) => x.trim()).join(" ").trim();
      if (text) blocks.push(["p", text]);
      buf = [];
    }
  };

  for (const ln of lines) {
    const s = ln.trim();
    if (!s) {
      flush();
      continue;
    }
    if (s.startsWith("# ")) {
      flush();
      title = s.slice(2).trim();
      continue;
    }
    if (s.startsWith("## ")) {
      flush();
      blocks.push(["h2", s.slice(3).trim()]);
      continue;
    }
    if (s.startsWith("> lead:")) {
      flush();
      lead = s.slice(7).trim();
      continue;
    }
    let m = s.match(AMAZON_LINE);
    if (m) {
      flush();
      blocks.push(["amazon", `${m[1]}|${m[2]}`]);
      continue;
    }
    m = s.match(TALK_LINE);
    if (m) {
      flush();
      blocks.push([SPEAKERS[m[1]][0], m[2].trim()]);
      continue;
    }
    if (s === "本編はこちら" || YT_LINE.test(s)) {
      flush();
      continue;
    }
    buf.push(s);
  }
  flush();
  return { title, lead, blocks };
}

export function epSortKey(ep) {
  const parts = ep.split("-");
  const season = parseInt(parts[0], 10);
  if (parts.length === 1) return [season, 0, 0];
  if (parts[1].startsWith("extra"))
    return [season, 90, parseInt(parts[1].slice(5) || "0", 10)];
  return [season, parseInt(parts[1], 10), 0];
}

export function compareEp(a, b) {
  const ka = epSortKey(a);
  const kb = epSortKey(b);
  for (let i = 0; i < 3; i++) {
    if (ka[i] !== kb[i]) return ka[i] - kb[i];
  }
  return 0;
}
