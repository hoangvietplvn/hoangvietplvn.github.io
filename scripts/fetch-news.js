#!/usr/bin/env node
/* Lấy tin từ các nguồn RSS khai báo trong news.config.json → static/news.json.
   Chạy trong GitHub Actions trước khi dựng trang. Nguồn nào lỗi thì bỏ qua, không làm hỏng lượt dựng.

   Kết quả cho mỗi mục:
   - items: tin mới nhất, xen kẽ các báo (dùng cho thanh tin gọn ở các trang trong)
   - hot:   5 tin "nóng" nhất. Báo không công bố lượt xem, nên độ nóng được chấm bằng số báo
            cùng đưa một sự việc, độ mới, và vị trí bài trên trang chuyên mục của từng báo.
   Và "topics": gợi ý đề tài có thể nóng lên, kèm lý do (cụm từ đang tăng tần suất / có mốc sắp tới). */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'static/news.json');
const HOUR = 3600e3;

/* ---------- đọc RSS ---------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', deg: '°', middot: '·', copy: '©', reg: '®', euro: '€' };
// thực thể chữ có dấu kiểu &aacute; &Ocirc; &atilde; …
const ACC = { acute: '\u0301', grave: '\u0300', circ: '\u0302', tilde: '\u0303', uml: '\u0308' };
const named = (e) => { const m = e.match(/^([a-zA-Z])(acute|grave|circ|tilde|uml)$/); return m ? (m[1] + ACC[m[2]]).normalize('NFC') : e === 'ETH' || e === 'Dstrok' ? 'Đ' : e === 'eth' || e === 'dstrok' ? 'đ' : null; };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : ''; }
  return named(e) ?? ENT[e.toLowerCase()] ?? m;
});
const uncdata = (s = '') => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
const text = (s = '') => decode(decode(uncdata(s)).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1] : ''; };
const httpUrl = (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : '');

function parse(xml, source) {
  const items = [];
  let pos = 0;
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const it = m[0];
    const t = text(tag(it, 'title')).slice(0, 220);
    const u = httpUrl(text(tag(it, 'link')) || text(tag(it, 'guid')));
    if (!t || !u || /^(tin tức|điểm tin|bản tin)\b/i.test(t)) continue; // bỏ các bài điểm tin tổng hợp
    const rawDesc = decode(uncdata(tag(it, 'description')));
    const img = httpUrl(decode((rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i) || it.match(/<(?:enclosure|media:content|media:thumbnail)[^>]+url=["']([^"']+)["']/i) || [])[1] || '').trim());
    const ms = Date.parse(text(tag(it, 'pubDate')) || text(tag(it, 'dc:date')));
    items.push({ t, u, s: source, d: Number.isFinite(ms) ? new Date(ms).toISOString() : null, sapo: text(rawDesc.replace(/<(ul|ol|table)[\s>][\s\S]*?<\/\1>/gi, ' ').replace(/<a[\s>][\s\S]*?<\/a>/gi, ' ')).replace(/^\([\p{L}.\s]{3,20}\)\s*[-–]\s*/u, '').slice(0, 600), img, pos: pos++ });
  }
  return items;
}

/* Báo không có RSS: đọc trang chuyên mục (các thẻ <article>), ngày đăng lấy từ sơ đồ tin của chính báo đó */
const sitemapDates = new Map();
async function newsDates(origin) {
  if (!sitemapDates.has(origin)) {
    sitemapDates.set(origin, (async () => {
      const map = new Map();
      try {
        const xml = await get(origin + '/sitemaps/google-news.xml');
        for (const m of xml.matchAll(/<url>[\s\S]*?<\/url>/gi)) { const loc = text(tag(m[0], 'loc')), d = Date.parse(text(tag(m[0], 'news:publication_date'))); if (loc && Number.isFinite(d)) map.set(loc, new Date(d).toISOString()); }
      } catch (e) { /* không có sơ đồ tin: bài không kèm giờ đăng */ }
      return map;
    })());
  }
  return sitemapDates.get(origin);
}
async function parsePage(html, source, pageUrl) {
  const origin = new URL(pageUrl).origin, dates = await newsDates(origin), items = [], seen = new Set();
  let pos = 0;
  for (const m of html.matchAll(/<article[\s>][\s\S]*?<\/article>/gi)) {
    const a = m[0].match(/<a[^>]+href=["']([^"']+)["'][^>]*title=["']([^"']+)["']/i) || [];
    let u = '';
    try { u = httpUrl(new URL(decode(a[1] || ''), pageUrl).href); } catch (e) { /* bỏ */ }
    const t = text(a[2] || '').slice(0, 220);
    if (!t || !u || seen.has(u) || /\/chuyen-muc\//.test(u)) continue;
    seen.add(u);
    const img = httpUrl(decode((m[0].match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || '').replace(/\/w\d{3}\//, '/w640/'));
    const p = m[0].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    items.push({ t, u, s: source, d: dates.get(u) || null, sapo: p ? text(p[1]).slice(0, 600) : '', img, pos: pos++ });
  }
  return items;
}

async function get(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; rss-reader)', Accept: 'application/rss+xml, application/xml, text/xml, */*' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

/* ---------- xử lý chữ ---------- */
const STOP = new Set(('và của là có cho các những một được trong với khi đã sẽ đang tại từ đến về này đó không người ra vào lên bị do vì để theo sau trước trên dưới như nhưng thì mà ở hay hoặc cũng rất nhiều hơn nào gì ai sao vẫn lại còn phải nên cùng qua bằng giữa mới nói việc năm ngày tháng ông bà anh chị vụ làm hai ba bốn nhất thế nếu tới lúc đây kia ấy mình họ chúng ta tôi rồi đi bởi nhằm gần hết cả mỗi từng số chỉ vừa bao nhiêu thêm giờ tuần hôm nay mai qua đâu vì sao thế nào').split(/\s+/));
const syll = (s) => s.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
const isContent = (w) => !STOP.has(w) && !/^\d+$/.test(w) && w.length > 1;
function grams(title) {
  const w = syll(title), uni = new Set(), bi = new Set(), tri = new Set();
  for (let i = 0; i < w.length; i++) {
    if (!isContent(w[i])) continue;
    uni.add(w[i]);
    if (i + 1 < w.length && isContent(w[i + 1])) {
      bi.add(w[i] + ' ' + w[i + 1]);
      if (i + 2 < w.length && isContent(w[i + 2])) tri.add(w[i] + ' ' + w[i + 1] + ' ' + w[i + 2]);
    }
  }
  return { uni, bi, tri };
}
// cụm từ quá phổ biến: không được tính là dấu hiệu hai bài nói về cùng một sự việc
const GENERIC = new Set(['việt nam', 'hà nội', 'tp hcm', 'thành phố', 'tổng thống', 'thủ tướng', 'bộ trưởng', 'công an', 'chủ tịch', 'tổng bí', 'bí thư', 'quốc hội', 'chính phủ', 'trung quốc', 'đà nẵng', 'thế giới', 'hồ chí', 'chí minh', 'khoa học', 'công nghệ', 'học công', 'pháp luật', 'xã hội', 'quốc tế', 'thời sự', 'người dân', 'hợp tác', 'phát triển', 'đại biểu', 'ủy ban', 'nhân dân', 'ban nhân', 'ubnd tỉnh', 'chuyển đổi', 'đổi số', 'doanh nghiệp', 'kinh tế', 'giao thông', 'quan hệ', 'đồng chí', 'lãnh đạo', 'triển khai', 'thực hiện', 'tổ chức', 'hội nghị', 'tăng cường', 'bảo đảm', 'đẩy mạnh']);
const shared = (a, b) => { let n = 0; for (const x of a) if (b.has(x) && !GENERIC.has(x)) n++; return n; };
const sameStory = (a, b) => {
  const sb = shared(a.g.bi, b.g.bi);
  if (sb >= 2) return true;
  const su = shared(a.g.uni, b.g.uni);
  return su >= 4 && su / (a.g.uni.size + b.g.uni.size - su) >= 0.4;
};

/* Gom các bài cùng nói về một sự việc */
function cluster(items) {
  const clusters = [];
  for (const it of items) {
    const c = clusters.find((cl) => cl.some((x) => sameStory(x, it)));
    if (c) c.push(it); else clusters.push([it]);
  }
  return clusters;
}

/* Điểm chính và con số cho infographic — chỉ lấy từ tiêu đề và sapo của chính bài báo */
function points(sapo) {
  if (!sapo) return [];
  return sapo.split(/(?<=[.!?…])\s+(?=[\p{Lu}"“(\d])/u).map((s) => s.trim()).filter((s) => s.length > 25).slice(0, 3).map((s) => (s.length > 240 ? s.slice(0, 237).replace(/\s+\S*$/, '') + '…' : s));
}
const NUM = /(\d[\d.,]*(?:\s?[-–]\s?\d[\d.,]*)?)\s?(%|(?:nghìn |ngàn |triệu |tỉ |tỷ )?(?:USD|đồng|euro|người|bị cáo|nạn nhân|quốc gia|nước|tỉnh|xã|vụ|năm tù|năm|tháng|ngày|giờ|phút|tuổi|km|ha|tấn|kg|căn|chuyến|điểm|lần|độ C|đô la)|nghìn|ngàn|triệu|tỉ|tỷ)(?![\p{L}])/giu;
function numbers(title, sapo) {
  const out = [], seen = new Set();
  for (const src of [title, ...(sapo ? sapo.split(/(?<=[.!?…])\s+/) : [])]) {
    for (const m of src.matchAll(NUM)) {
      const v = (m[1].replace(/\s/g, '') + (m[2] === '%' ? '%' : ' ' + m[2])).trim();
      if (seen.has(v) || /^(19|20)\d\d năm$/.test(v) || out.length >= 3) continue;
      // câu ngắn chứa con số làm chú thích
      const clause = src.split(/[,;:–—]\s/).find((c) => c.includes(m[0])) || src;
      seen.add(v);
      out.push({ v, c: clause.trim().replace(/[.…]+$/, '').slice(0, 90) });
    }
  }
  return out;
}

/* Rút thêm ý chính từ thân bài: đọc trang bài báo, lấy các đoạn văn, chấm điểm từng câu
   (có con số, nhắc lại từ khoá của tiêu đề, nằm ở phần đầu bài) và giữ nguyên văn vài câu cao điểm nhất. */
const JUNK = /©|bản quyền|giấy phép|tổng biên tập|tòa soạn|toà soạn|liên hệ quảng cáo|đường dây nóng|hotline|email:|điện thoại:|tải ứng dụng|theo dõi (chúng tôi|báo)|đăng ký nhận|chia sẻ bài viết|bình luận|xem thêm|đọc thêm|tin liên quan|mời (quý|bạn đọc)|ảnh:|nguồn:|video:|clip:|đồ họa:|click|bấm vào|quét mã|trụ sở|ghi rõ nguồn/iu;
function bodyParagraphs(html) {
  // khoanh vùng thân bài nếu trang có đánh dấu, và cắt bỏ phần tin liên quan / bình luận phía sau
  let h = html.replace(/<(script|style|noscript)[\s>][\s\S]*?<\/\1>/gi, ' ');
  const start = h.search(/itemprop=["']articleBody["']|class=["'][^"']*\b(article__body|fck_detail|singular-content|detail-content|entry-content|article-content|content-detail|detail__content|e-magazine__body)\b/i);
  if (start > 0) {
    h = h.slice(start);
    const end = h.slice(400).search(/class=["'][^"']*\b(article__tag|article__foot|article__comment|box-comment|comment-box)\b|<footer[\s>]/i);
    if (end > 0) h = h.slice(0, end + 400);
  }
  h = h.replace(/<article[^>]*class=["'][^"']*\bstory\b[\s\S]*?<\/article>/gi, ' ') // từng mục trong khối "tin liên quan"
    .replace(/<(svg|figure|figcaption|table|header|footer|nav|aside|form|iframe|button|select|ul|ol|h[1-6])[\s>][\s\S]*?<\/\1>/gi, ' ');
  const out = [];
  for (const m of h.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi)) {
    if ((m[1].match(/<a[\s>]/gi) || []).length > 2) continue; // đoạn toàn liên kết
    const t = text(m[1]);
    if (t.length < 70 || t.length > 900 || JUNK.test(t)) continue;
    out.push(t);
  }
  return out;
}
function keySentences(html, title, have, max = 4) {
  const paras = bodyParagraphs(html);
  if (paras.length < 3) return [];
  const tw = grams(title).uni, haveSets = have.map((x) => grams(x).uni);
  const topic = new Set([...tw, ...haveSets.flatMap((x) => [...x])]);
  const cands = [];
  paras.slice(0, 22).forEach((para, pi) => {
    if (!/[.!?…]/.test(para)) return; // khối tiêu đề tin liên quan: không có dấu câu
    para.split(/(?<=[.!?…])\s+(?=[\p{Lu}"“(\d])/u).forEach((raw) => {
      const sen = raw.trim().replace(/^[-–•*]\s*/, '').replace(/^\([\p{L}.\s]{2,20}\)\s*[-–]\s*/u, '');
      if (sen.length < 60 || sen.length > 260 || !/[.!…”"')]$/.test(sen) || JUNK.test(sen)) return;
      const g = grams(sen).uni;
      if (g.size < 6) return;
      if (shared(g, topic) < (pi < 4 ? 2 : 3)) return; // không bám chủ đề: nhiều khả năng thuộc bài khác trên cùng trang
      if (haveSets.some((hs) => shared(g, hs) / Math.min(g.size, hs.size || 1) > 0.6)) return; // đã có trong sapo
      const nums = (sen.match(/\d[\d.,]*/g) || []).length;
      const score = Math.min(nums, 2) * 1.2 + Math.min(shared(g, tw), 4) * 0.6 + (pi < 3 ? 1.5 : pi < 7 ? 0.8 : pi < 12 ? 0.3 : 0) + (/["“”]/.test(sen) ? 0.4 : 0) + (/^(theo|trước đó|hiện|đến nay|cơ quan|kết quả|nguyên nhân|dự kiến)/iu.test(sen) ? 0.4 : 0) - (sen.length > 220 ? 0.5 : 0);
      cands.push({ sen, g, pi, score, i: cands.length });
    });
  });
  const pick = [];
  for (const c of [...cands].sort((a, b) => b.score - a.score)) {
    if (pick.length >= max) break;
    if (pick.filter((x) => x.pi === c.pi).length >= 1) continue; // mỗi đoạn một câu, để ý trải khắp bài
    if (pick.some((x) => shared(x.g, c.g) / Math.min(x.g.size, c.g.size) > 0.5)) continue;
    pick.push(c);
  }
  return pick.sort((a, b) => a.i - b.i).map((x) => x.sen);
}

const FUTURE = /(từ (?:ngày )?\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|từ (?:tháng|năm|quý) [\dIV]+(?:[/-]\d{4})?|(?:trong |đầu |cuối |đến )?năm 20(?:2[7-9]|3\d)|sắp (?:tới|diễn ra|có hiệu lực|được|ra mắt|áp dụng|xét xử|khởi công|thông xe|vận hành)|dự kiến [^,.;]{3,40}|đề xuất [^,.;]{3,40}|dự thảo [^,.;]{3,40}|lấy ý kiến [^,.;]{3,40}|trình Quốc hội|có hiệu lực [^,.;]{0,30}|sẽ (?:được |bị |chính thức |bắt đầu |áp dụng |xét xử |diễn ra |tăng |giảm |cấm |thí điểm )[^,.;]{0,40})/iu;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/* lấy lại cách viết hoa gốc của cụm từ trong tiêu đề */
function original(phrase, title) {
  const w = title.normalize('NFC').split(/\s+/), low = w.map((x) => x.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')), p = phrase.split(' ');
  for (let i = 0; i + p.length <= low.length; i++) if (p.every((x, k) => low[i + k] === x)) return w.slice(i, i + p.length).join(' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  return phrase;
}

(async () => {
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'news.config.json'), 'utf8')); } catch (e) { console.log('Không đọc được news.config.json — bỏ qua điểm tin.'); return; }
  if (!cfg.enabled) { console.log('Điểm tin đang tắt.'); fs.rmSync(OUT, { force: true }); return; }
  const per = Math.min(20, Math.max(1, +cfg.per_category || 8));
  const now = Date.now(), categories = [], everything = [], stories = [];
  const age = (x) => (x.d ? (now - Date.parse(x.d)) / HOUR : 12);
  const slim = (x) => ({ t: x.t, u: x.u, s: x.s, d: x.d });

  for (const cat of cfg.categories || []) {
    const name = String(cat.name || '').slice(0, 40);
    const bySource = new Map();
    await Promise.all((cat.feeds || []).map(async (f) => {
      if (!f || !/^https:\/\//i.test(f.url || '')) return;
      const source = String(f.source || '').slice(0, 40);
      try {
        const body = await get(f.url);
        const list = (/<item[\s>]/i.test(body) ? parse(body, source) : await parsePage(body, source, f.url)).filter((x) => !x.d || (now - Date.parse(x.d) < 48 * HOUR && Date.parse(x.d) - now < HOUR));
        console.log(`✓ ${name} · ${source}: ${list.length} tin (${f.url.replace(/^https:\/\/[^/]+/, '')})`);
        if (list.length) bySource.set(source, [...(bySource.get(source) || []), ...list]);
      } catch (e) { console.log(`✗ ${name} · ${source}: ${e.message} (${f.url})`); }
    }));
    const lists = [...bySource.values()].map((l) => l.sort((a, b) => (b.d || '').localeCompare(a.d || '')));
    const all = [], seenUrl = new Set();
    for (const l of lists) for (const x of l) { if (seenUrl.has(x.u)) continue; seenUrl.add(x.u); x.g = grams(x.t); x.cat = name; all.push(x); }
    if (!all.length) continue;
    everything.push(...all);

    // tin mới nhất, xen kẽ các báo
    lists.sort((a, b) => (b[0].d || '').localeCompare(a[0].d || ''));
    const items = [], seen = new Set();
    for (let i = 0; items.length < per && lists.some((l) => l[i]); i++) for (const l of lists) {
      const x = l[i];
      if (!x || seen.has(x.u) || seen.has(x.t) || items.length >= per) continue;
      seen.add(x.u); seen.add(x.t); items.push(slim(x));
    }

    // tin nóng: chấm điểm từng cụm bài cùng sự việc
    let clusters = cluster(all.filter((x) => age(x) <= 30)).map((cl) => {
      const sources = new Set(cl.map((x) => x.s));
      const newest = Math.min(...cl.map(age));
      const top = Math.min(...cl.map((x) => x.pos));
      const score = sources.size * 3 + Math.min(cl.length, 6) * 0.5 + (newest < 3 ? 2 : newest < 8 ? 1 : newest < 16 ? 0.3 : 0) + Math.max(0, (8 - top) / 8);
      const rep = [...cl].sort((a, b) => (b.img ? 1 : 0) + (b.sapo.length > 60 ? 1 : 0) - ((a.img ? 1 : 0) + (a.sapo.length > 60 ? 1 : 0)) || (b.d || '').localeCompare(a.d || ''))[0];
      return { cl, sources, score, rep, cat: name };
    }).sort((a, b) => b.score - a.score);
    stories.push(...clusters.slice(0, 25));
    clusters.length = Math.min(clusters.length, 5);
    for (const c of clusters) c.cl.forEach((x) => { x.hot = true; });
    const hot = clusters.map(({ cl, sources, rep }) => {
      const also = [], had = new Set([rep.s]);
      for (const x of cl) { if (had.has(x.s)) continue; had.add(x.s); also.push({ t: x.t, u: x.u, s: x.s }); }
      return { ...slim(rep), img: rep.img, n: sources.size, k: cl.length, p: points(rep.sapo), nums: numbers(rep.t, rep.sapo), also: also.slice(0, 4) };
    });
    console.log(`  ${name} — tin nóng:\n` + hot.map((h, i) => `   ${i + 1}. [${h.n} báo] ${h.t}`).join('\n'));
    categories.push({ name, items, hot });
  }
  if (!categories.length) { console.log('Không lấy được tin nào — khu tin sẽ ẩn.'); fs.rmSync(OUT, { force: true }); return; }

  /* Bản đang đăng trên trang: dùng lại phần tóm tắt thân bài đã có (khỏi tải lại bài báo) và cụm gợi ý đề tài chưa đến giờ đổi */
  let prev = {};
  try {
    const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8')).url.replace(/\/$/, '');
    prev = JSON.parse(await get(site + '/news.json?t=' + now));
  } catch (e) { console.log('  (không đọc được bản news.json đang đăng: ' + e.message + ')'); }
  const VERSION = 5; // tăng số này khi đổi cách tóm tắt/gợi ý, để bản đang đăng không bị dùng lại
  const done = new Map();
  if (prev.v === VERSION) for (const c of prev.categories || []) for (const h of c.hot || []) if (h && h.x && Array.isArray(h.p)) done.set(h.u, h);
  let fetched = 0, reused = 0, failed = 0;
  await Promise.all(categories.flatMap((c) => c.hot.map(async (h) => {
    const old = done.get(h.u);
    if (old) { h.p = old.p; h.nums = old.nums || h.nums; h.x = 1; reused++; return; }
    try {
      const extra = keySentences(await get(h.u), h.t, h.p);
      if (!extra.length) { failed++; console.log(`  ✗ không rút được ý từ thân bài: ${h.s} — ${h.u}`); return; }
      h.p = [...h.p.slice(0, 2), ...extra];
      h.nums = numbers(h.t, h.p.join(' '));
      h.x = 1; fetched++;
    } catch (e) { failed++; console.log(`  ✗ không tải được bài: ${h.s} — ${e.message}`); }
  })));
  console.log(`  Tóm tắt thân bài: ${fetched} bài mới, ${reused} bài dùng lại, ${failed} bài không rút được`);
  if (process.env.NEWS_DEBUG || fetched) { const one = categories.flatMap((c) => c.hot).filter((h) => h.x && !done.has(h.u)).slice(0, 7); for (const h of one) console.log(`   ▸ ${h.s}: ${h.t}\n` + h.p.map((x) => '       - ' + x.slice(0, 150)).join('\n')); }

  /* ---------- gợi ý đề tài: góc chưa báo nào khai thác ----------
     Với mỗi sự việc đang được nhiều báo đưa, đối chiếu tiêu đề + phần mở đầu của tất cả các bài
     với một bộ "góc khai thác". Góc nào hợp với loại sự việc mà chưa bài nào chạm tới thì thành gợi ý. */
  const W = (alts) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, 'iu'); // khớp trọn từ, tránh "nổ" dính "nổi"
  const INCIDENT = W('vụ nổ|nổ lớn|nổ bình gas|nổ gas|phát nổ|cháy|hỏa hoạn|sập|tai nạn|sạt lở|ngộ độc|sự cố|tử vong|thiệt mạng|bị thương|mất tích|mưa lũ|lũ quét|ngập|đuối nước|rò rỉ|lật xe|chìm tàu');
  const CRIME = W('bắt giữ|bắt tạm giam|bắt khẩn cấp|bắt quả tang|bắt nhóm|bắt đối tượng|bắt nghi phạm|khởi tố|truy tố|xét xử|tạm giam|tạm giữ|lừa đảo|đường dây|chiếm đoạt|tham ô|hối lộ|buôn lậu|hàng giả|cưỡng đoạt|sát hại|ma túy|đánh bạc|bị cáo|bị can|phạt tù|năm tù|lĩnh án');
  const POLICY = W('dự thảo|đề xuất|nghị định|nghị quyết|thông tư|thí điểm|đề án|luật sửa đổi|sửa đổi, bổ sung|thông qua luật|ban hành|có hiệu lực|phê duyệt|quy định mới|lấy ý kiến|chính sách mới');
  const PROJECT = W('dự án|quy hoạch|khởi công|di dời|tái thiết|cao tốc|sân bay|đường sắt|metro|giải phóng mặt bằng|tuyến đường|cầu vượt|khu đô thị|tái định cư');
  const ENACTED = W('quốc hội thông qua|chính phủ ban hành|thủ tướng phê duyệt|bộ chính trị ban hành|hđnd thông qua|ký ban hành|có hiệu lực|chính thức áp dụng|bắt đầu áp dụng|ban hành nghị định|ban hành thông tư|ban hành nghị quyết');
  const SCAM = W('lừa đảo|chiếm đoạt|hàng giả|giả mạo|ngộ độc|cưỡng đoạt|tín dụng đen|đa cấp|mạo danh|deepfake|tấn công mạng|lộ dữ liệu|lộ lọt dữ liệu|mã độc');
  const WORLD = W('thuế quan|áp thuế|trừng phạt|xung đột|chiến sự|bầu cử|lãi suất|giá dầu|chip|bán dẫn|thương mại|xuất khẩu|nhập cư|visa|nvidia|chuỗi cung ứng|lệnh cấm|đàm phán|ngừng bắn|tấn công');
  const DIGITAL = W('ai|trí tuệ nhân tạo|chatbot|ứng dụng|nền tảng|mạng xã hội|dữ liệu|robot|camera|định danh|sinh trắc|tài sản số|tiền số|blockchain|microsoft|google|meta|openai');
  // tin lễ tân, ảnh, đồ hoạ: không phải chất liệu để mở góc mới
  const SKIP = /^\s*\[(ảnh|infographic|video|photo|emagazine|longform)\]|tiếp (đặc phái viên|đại sứ|đoàn|chủ tịch|thủ tướng|bộ trưởng)|hội kiến|hội đàm|điện mừng|thư mừng|thư chúc mừng|chúc mừng|thăm chính thức|lễ đón|chiêu đãi|dâng hương|tưởng niệm|kỷ niệm \d+ năm/iu;
  const ANGLES = [
    { id: 'ke-ho', name: 'Kẽ hở quy định', q: 'Kẽ hở nào trong quy định đã bị lợi dụng, và cần vá ra sao?', what: 'kẽ hở hay bất cập của quy định hiện hành',
      has: W('lỗ hổng|kẽ hở|bất cập|khoảng trống pháp lý|sửa luật|cần sửa|hoàn thiện pháp luật|hoàn thiện quy định|hoàn thiện thể chế|kiến nghị'), fit: (c) => CRIME.test(c.text), cats: ['Pháp luật', 'Thời sự', 'Xã hội'] },
    { id: 'phap-ly', name: 'Góc pháp lý', q: 'Ai chịu trách nhiệm pháp lý và bồi thường, theo quy định nào?', what: 'trách nhiệm pháp lý hay việc bồi thường',
      has: W('trách nhiệm pháp lý|trách nhiệm hình sự|trách nhiệm dân sự|trách nhiệm bồi thường|bồi thường|chế tài|mức phạt|khung hình phạt|luật sư|theo điều|theo quy định|theo bộ luật|xử lý hình sự|xử lý trách nhiệm'), fit: (c) => INCIDENT.test(c.text) && !CRIME.test(c.text), cats: ['Thời sự', 'Xã hội', 'Pháp luật', 'Khoa học Công nghệ'] },
    { id: 'tu-ve', name: 'Cẩm nang cho người dân', q: 'Người dân cần làm gì để nhận biết, phòng tránh và đòi quyền lợi?', what: 'hướng dẫn cụ thể cho người dân',
      has: W('cách nhận biết|cách phòng|cách xử lý|cần làm gì|nên làm gì|hướng dẫn|khuyến cáo|cảnh báo|lưu ý|dấu hiệu nhận biết|quyền lợi'), fit: (c) => SCAM.test(c.text), cats: ['Pháp luật', 'Xã hội', 'Khoa học Công nghệ', 'Thời sự'] },
    { id: 'thuc-thi', name: 'Khâu thực thi', q: 'Ai giám sát việc thực thi, nguồn lực ở đâu và dễ vướng ở khâu nào?', what: 'khâu giám sát và điều kiện thực thi',
      has: W('giám sát|thực thi|hậu kiểm|khả thi|nguồn lực|lộ trình|vướng mắc|tổ chức thực hiện|hướng dẫn thi hành'), fit: (c) => ENACTED.test(c.text) && !CRIME.test(c.text), cats: ['Thời sự', 'Pháp luật', 'Xã hội', 'Khoa học Công nghệ'] },
    { id: 'quoc-te', name: 'So sánh quốc tế', q: 'Các nước đã xử lý vấn đề này thế nào, và bài học nào dùng được cho Việt Nam?', what: 'kinh nghiệm của các nước',
      has: W('kinh nghiệm quốc tế|kinh nghiệm các nước|kinh nghiệm thế giới|các nước|nước ngoài|quốc tế|thế giới|khu vực|nhật bản|hàn quốc|singapore|trung quốc|châu âu|mỹ|asean'), fit: (c) => POLICY.test(c.text) && !CRIME.test(c.text) && !INCIDENT.test(c.text), cats: ['Thời sự', 'Pháp luật', 'Xã hội', 'Khoa học Công nghệ'] },
    { id: 'viet-nam', name: 'Tác động tới Việt Nam', q: 'Diễn biến này tác động gì tới Việt Nam, doanh nghiệp và người lao động Việt?', what: 'tác động tới Việt Nam',
      has: W('việt nam|người việt|doanh nghiệp việt|trong nước|hà nội'), fit: (c) => WORLD.test(c.text), cats: ['Quốc tế'] },
    { id: 'kinh-phi', name: 'Bài toán kinh phí', q: 'Tiền ở đâu ra, ai chi trả và ai được hưởng lợi?', what: 'nguồn kinh phí và người chi trả',
      has: W('chi phí|kinh phí|ngân sách|nguồn vốn|vốn đầu tư|tỷ đồng|tỉ đồng|triệu usd|tỷ usd|đền bù'), fit: (c) => PROJECT.test(c.text) && !CRIME.test(c.text), cats: ['Thời sự', 'Xã hội', 'Khoa học Công nghệ'] },
    { id: 'du-lieu', name: 'Nhìn bằng số liệu', q: 'Những vụ việc tương tự xảy ra dày đến mức nào? Thống kê nói gì về xu hướng?', what: 'số liệu thống kê hay bức tranh toàn cảnh',
      has: W('thống kê|số liệu|toàn cảnh|nhìn lại|từ đầu năm|cùng kỳ|so với năm'), fit: (c) => INCIDENT.test(c.text) || CRIME.test(c.text), cats: ['Xã hội', 'Pháp luật', 'Thời sự'] },
    { id: 'rui-ro-so', name: 'Rủi ro pháp lý số', q: 'Rủi ro pháp lý, dữ liệu cá nhân và trách nhiệm của nền tảng nằm ở đâu?', what: 'rủi ro pháp lý hay dữ liệu cá nhân',
      has: W('pháp lý|quyền riêng tư|dữ liệu cá nhân|bản quyền|trách nhiệm|rủi ro|an toàn thông tin|bảo mật|lừa đảo|quy định'), fit: (c) => DIGITAL.test(c.text), cats: ['Khoa học Công nghệ'] },
  ];
  const withText = stories.map((c) => ({ ...c, text: c.cl.map((x) => x.t + '. ' + x.sapo).join(' \n ') }));
  function suggest() {
    const out = [], taken = [];
    for (const cat of categories) {
      const pool = withText.filter((c) => c.cat === cat.name).sort((a, b) => b.sources.size - a.sources.size || b.score - a.score);
      const items = [], usedAngles = new Set();
      for (const minSrc of [2, 1]) for (const c of pool) { // ưu tiên sự việc nhiều báo đưa; thiếu thì lấy cả sự việc mới có một báo
        if (items.length >= 3) break;
        if (c.used || c.sources.size < minSrc || SKIP.test(c.rep.t) || taken.some((o) => sameStory(o.rep, c.rep))) continue;
        const angle = ANGLES.find((a) => a.cats.includes(c.cat) && !usedAngles.has(a.id) && a.fit(c) && !a.has.test(c.text));
        if (!angle) continue;
        c.used = true; taken.push(c); usedAngles.add(angle.id);
        const n = c.sources.size, k = c.cl.length;
        items.push({
          angle: angle.name, q: angle.q, n, k, story: { t: c.rep.t, u: c.rep.u, s: c.rep.s },
          why: n > 1
            ? `${n} báo đã đăng ${k} bài về sự việc này, nhưng chưa bài nào nhắc tới ${angle.what} trong tiêu đề và phần mở đầu. Sự việc đang được theo dõi rộng, nên một bài đi riêng góc này có chỗ đứng.`
            : `Mới có ${c.rep.s} đưa tin, và bài chưa nhắc tới ${angle.what} trong tiêu đề và phần mở đầu. Sự việc còn mới, đi trước góc này sẽ không trùng ai.`,
        });
      }
      if (items.length) out.push({ name: cat.name, items });
    }
    return out;
  }
  // Mốc đổi: 12:00 và 21:00 giờ Việt Nam (05:00 và 14:00 UTC). Giữa hai mốc thì giữ nguyên cụm gợi ý đang đăng.
  const SLOTS = [5, 14], day = 24 * HOUR, base = Math.floor(now / day) * day;
  const marks = [-1, 0, 1].flatMap((d) => SLOTS.map((h) => base + d * day + h * HOUR)).sort((a, b) => a - b);
  const lastMark = Math.max(...marks.filter((m) => m <= now)), nextMark = Math.min(...marks.filter((m) => m > now));
  const old = prev.topics;
  const keep = prev.v === VERSION && old && Array.isArray(old.cats) && old.cats.length && Date.parse(old.at) >= lastMark && !process.env.NEWS_FORCE_TOPICS;
  const topics = keep ? { ...old, next: new Date(nextMark).toISOString() } : { at: new Date().toISOString(), next: new Date(nextMark).toISOString(), cats: suggest() };
  const nTopics = topics.cats.reduce((n, c) => n + c.items.length, 0);
  console.log(`  Gợi ý đề tài (${keep ? 'giữ bản lúc ' + old.at : 'tạo mới'}; lần đổi tới ${topics.next}):\n` + topics.cats.map((c) => `   ${c.name}:\n` + c.items.map((t) => `     · [${t.angle}] ← ${t.story.t} (${t.n} báo, ${t.k} bài)`).join('\n')).join('\n'));

  /* ---------- Cảnh báo tin giả ----------
     Nguồn chính thức (Trung tâm Xử lý tin giả Việt Nam - VAFC): lấy toàn bộ.
     Các báo: chỉ giữ bài có tiêu đề nói về tin giả / thông tin sai sự thật / giả mạo
     và có dấu hiệu cơ quan chức năng lên tiếng, bác bỏ hoặc xử lý. Danh sách được cộng dồn qua các lượt chạy. */
  const fakeCfg = cfg.fake || {};
  let fake = null;
  if (fakeCfg.enabled !== false) {
    const FAKE = W('tin giả|thông tin giả|thông tin sai sự thật|sai sự thật|thông tin sai lệch|sai lệch|bịa đặt|thất thiệt|xuyên tạc|không đúng sự thật|bác bỏ|deepfake|mạo danh|giả danh|giả mạo|cắt ghép|thông tin xấu độc|tin đồn');
    const ACT = W('xử phạt|bị phạt|phạt|khởi tố|tạm giữ|triệu tập|làm việc|xử lý|cảnh báo|khuyến cáo|bác bỏ|khẳng định|lên tiếng|thông tin chính thức|chính thức|đề nghị|công an|bộ|sở|ubnd|ủy ban|cơ quan chức năng|cơ quan|trung tâm xử lý tin giả|vafc|ngân hàng nhà nước|tòa án|viện kiểm sát');
    const DEALT = W('xử phạt|bị phạt|phạt tiền|phạt hành chính|khởi tố|tạm giữ|triệu tập|mời làm việc|mời lên làm việc|xử lý hành chính|xử lý nghiêm|bắt giữ|bắt tạm giam');
    const SPOOF = W('giả mạo|mạo danh|giả danh|lừa đảo|deepfake|cắt ghép|trang giả|website giả|tài khoản giả|ứng dụng giả');
    const kindOf = (x) => { const s = x.t + '. ' + x.sapo; return DEALT.test(s) ? 'Đã xử lý người tung tin' : SPOOF.test(x.t) ? 'Cảnh báo giả mạo, lừa đảo' : 'Bác bỏ tin sai'; };
    const pool = [];
    for (const x of everything) pool.push(x);
    await Promise.all((fakeCfg.feeds || []).map(async (f) => {
      if (!f || !/^https:\/\//i.test(f.url || '')) return;
      const source = String(f.source || '').slice(0, 60);
      try {
        const body = await get(f.url);
        const list = (/<item[\s>]/i.test(body) ? parse(body, source) : await parsePage(body, source, f.url));
        let n = 0;
        for (const x of list) {
          if (!f.official && x.d && now - Date.parse(x.d) > 72 * HOUR) continue;
          x.official = !!f.official; x.g = grams(x.t); pool.push(x); n++;
        }
        console.log(`✓ Tin giả · ${source}: ${n} tin quét (${f.url.replace(/^https:\/\/[^/]+/, '')})`);
      } catch (e) { console.log(`✗ Tin giả · ${source}: ${e.message} (${f.url})`); }
    }));
    const found = new Map();
    for (const x of pool) {
      if (found.has(x.u)) continue;
      if (!x.official && !(FAKE.test(x.t) && ACT.test(x.t + ' ' + x.sapo))) continue;
      found.set(x.u, x);
    }
    // gộp với danh sách đang đăng (giữ cảnh báo tối đa 10 ngày), bỏ trùng sự việc
    const KEEP = 10 * 24 * HOUR;
    const oldItems = ((prev.fake || {}).items || []).filter((o) => o && o.u && !(o.official && !o.d) && now - Date.parse(o.d || o.seen || 0) < KEEP);
    const items = [];
    for (const o of oldItems) items.push({ ...o, g: grams(o.t) });
    for (const x of found.values()) {
      if (items.some((o) => o.u === x.u || sameStory(o, x))) continue;
      items.push({ t: x.t, u: x.u, s: x.s, d: x.d, img: x.img, sapo: x.sapo, p: points(x.sapo), official: x.official, seen: new Date(now).toISOString(), g: x.g });
    }
    // bổ sung ngày đăng (nguồn VAFC không ghi ngày trong RSS), ảnh và ý chính từ thân bài cho tin mới
    // ngày đăng: ưu tiên thẻ meta có cấu trúc; nếu phải đọc trong chữ thì chỉ nhận ngày trong 30 ngày gần đây
    const okDate = (d) => Number.isFinite(d) && d <= now + HOUR && now - d < 30 * 24 * HOUR;
    // ngày lấy từ thẻ có cấu trúc được nhận cả khi đã cũ (để loại tin cũ cho đúng)
    const vnDate = (dd, mm, yy, hh, mi) => Date.UTC(+yy, +mm - 1, +dd, (+hh || 0) - 7, +mi || 0);
    const pageDate = (html) => {
      const vafc = html.match(/class=["'][^"']*\bdate\b[^"']*["'][^>]*>\s*(\d{1,2})\/(\d{1,2})\/(20\d\d)\s*-\s*(\d{1,2}):(\d{2})/i);
      if (vafc) return new Date(vnDate(vafc[1], vafc[2], vafc[3], vafc[4], vafc[5])).toISOString();
      for (const re of [/property=["']article:published_time["'][^>]*content=["']([^"']+)/i, /content=["']([^"']+)["'][^>]*property=["']article:published_time/i, /itemprop=["']datePublished["'][^>]*(?:content|datetime)=["']([^"']+)/i, /"datePublished"\s*:\s*"([^"]+)"/i]) {
        const m = html.match(re); if (m && Number.isFinite(Date.parse(m[1]))) return new Date(Date.parse(m[1])).toISOString();
      }
      const body = html.replace(/<(script|style|header|footer|nav)[\s>][\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
      for (const v of body.matchAll(/(\d{1,2})\/(\d{1,2})\/(20\d\d)(?:\s*[-|,]?\s*(\d{1,2}):(\d{2}))?/g)) {
        const d = vnDate(v[1], v[2], v[3], v[4], v[5]);
        if (okDate(d)) return new Date(d).toISOString();
      }
      return null;
    };
    const fresh = items.filter((o) => !o.x).slice(0, 25);
    await Promise.all(fresh.map(async (o) => {
      try {
        const html = await get(o.u);
        if (!o.d) o.d = pageDate(html);
        if (!o.img) o.img = httpUrl(decode((html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image/i) || [])[1] || ''));
        if (!o.sapo) { const og = html.match(/<meta[^>]+(?:property=["']og:description["']|name=["']description["'])[^>]+content=["']([^"']+)/i); if (og) { o.sapo = text(og[1]).slice(0, 600); o.p = points(o.sapo); } }
        const extra = keySentences(html, o.t, o.p || [], 4);
        o.p = [...(o.p || []).slice(0, 2), ...extra];
        o.x = 1;
      } catch (e) { console.log(`  ✗ không tải được cảnh báo: ${o.s} — ${e.message}`); }
    }));
    const ts = (o) => Date.parse(o.d || o.seen || 0) || 0;
    const out = items.filter((o) => now - ts(o) < KEEP && !(o.official && !o.d)).sort((a, b) => ts(b) - ts(a)).slice(0, 18)
      .map((o) => ({ t: o.t, u: o.u, s: o.s, d: o.d || null, seen: o.seen, img: o.img || '', p: (o.p || []).slice(0, 6), nums: numbers(o.t, (o.p || []).join(' ')), kind: o.kind || kindOf({ t: o.t, sapo: o.sapo || (o.p || []).join(' ') }), official: !!o.official, x: o.x || 0 }));
    fake = { label: String(fakeCfg.label || 'Cảnh báo tin giả').slice(0, 40), items: out };
    console.log(`  Cảnh báo tin giả: ${out.length} tin (${out.filter((o) => o.official).length} từ nguồn chính thức)\n` + out.map((o) => `   · [${o.kind}] ${o.t} — ${o.s}${o.d ? ' · ' + o.d.slice(0, 10) : ''}`).join('\n'));
  }

  fs.writeFileSync(OUT, JSON.stringify({ v: VERSION, updated: new Date().toISOString(), label: String(cfg.label || 'Tin nóng').slice(0, 30), categories, topics, fake }));
  console.log(`→ static/news.json: ${categories.map((c) => `${c.name} ${c.items.length}/${c.hot.length}`).join(', ')}; ${nTopics} gợi ý; ${Math.round(fs.statSync(OUT).size / 1024)} KB`);
})().catch((e) => { console.log('Lỗi lấy tin: ' + (e.stack || e.message)); });
