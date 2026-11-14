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
// cụm chỉ gồm chức danh, cơ quan (phó chủ, tịch ubnd, bí thư tỉnh…) không phải dấu hiệu cùng sự việc
const ROLE = new Set('chủ tịch phó ubnd ủy ban bí thư tỉnh thành phố bộ trưởng thứ tổng giám đốc cục sở tướng thủ quốc hội đại biểu nhân dân hđnd đảng ủy trung ương chính phủ lãnh đạo cán bộ viên huyện xã phường cơ quan'.split(' '));
const roleOnly = (g) => g.split(' ').every((w) => ROLE.has(w));
const shared = (a, b) => { let n = 0; for (const x of a) if (b.has(x) && !GENERIC.has(x) && !roleOnly(x)) n++; return n; };
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
    const c = clusters.find((cl) => sameStory(cl[0], it) || (cl.length > 1 && sameStory(cl[1], it) && sameStory(cl[0], cl[1])));
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
  const VERSION = 15; // tăng số này khi đổi cách tóm tắt/gợi ý, để bản đang đăng không bị dùng lại
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
  const withText = stories.map((c) => ({ ...c, text: c.cl.map((x) => x.t + '. ' + x.sapo).join(' \n ') }));
  /* ---------- Ý tưởng đề tài có thể thành trend ----------
     Mỗi sự kiện đang lên: rút chủ thể của sự kiện, nhận dạng loại sự kiện và các yếu tố dễ lan truyền,
     rồi bung ra 3 đề tài có tiêu đề riêng từ kho mẫu theo loại. Mẫu được xoay vòng theo mốc 12:00 / 21:00. */
  const IDEAS = {
    incident: [
      ['i1', 'Sau {X}: 5 điều cần kiểm tra ngay trong nhà bạn', 'Infographic dạng checklist', 'checklist hữu ích, dễ được lưu và chia sẻ vào nhóm gia đình', 'nổ|cháy|gas|điện|ngộ độc|rò rỉ|hỏa hoạn'],
      ['i2', '{X} qua lời kể của những người có mặt', 'Phóng sự nhân chứng, video dọc', 'câu chuyện người thật, cảm xúc thật giữ người xem tới cuối'],
      ['i3', 'Những câu hỏi chưa có lời đáp sau {X}', 'Bài phân tích', 'đặt đúng câu người đọc đang thắc mắc nên dễ kéo bình luận'],
      ['i4', '60 giây tái hiện {X}', 'Video đồ hoạ ngắn', 'video ngắn tái hiện diễn biến hợp thuật toán TikTok, Reels', 'nổ|cháy|sập|tai nạn|sạt lở|lũ|lật|va chạm|hỏa hoạn'],
      ['i5', 'Gặp tình huống như {X}, làm gì trong 5 phút đầu?', 'Video hướng dẫn kỹ năng', 'kỹ năng thực dụng, người xem có lý do gửi cho người thân', 'nổ|cháy|gas|sập|tai nạn|lũ|sạt lở|ngộ độc|đuối nước|động đất|hỏa hoạn'],
      ['i6', '{X}: những người hùng thầm lặng', 'Chân dung ngắn', 'câu chuyện tích cực giữa tin buồn thường lan toả mạnh', 'cứu|tìm kiếm|cấp cứu|sơ tán|lũ|sạt lở|cháy|nổ|sập'],
      ['i7', 'Bản đồ những sự việc tương tự {X} từ đầu năm', 'Bản đồ tương tác', 'bức tranh toàn cảnh khiến người đọc bất ngờ về mức độ phổ biến'],
    ],
    crime: [
      ['c1', 'Giải mã thủ đoạn trong {X}: kịch bản được dựng thế nào?', 'Infographic từng bước', 'người đọc tò mò cách kẻ gian vận hành và chia sẻ để cảnh báo người thân', 'lừa|chiếm đoạt|giả mạo|đường dây|thủ đoạn|tham ô|rửa tiền'],
      ['c2', '{X}: dòng tiền đã chạy đi đâu?', 'Sơ đồ dòng tiền', 'đồ hoạ "theo dấu tiền" gây tò mò, dễ lan trên mạng xã hội', 'lừa|chiếm đoạt|tham ô|tiền|tỷ|tỉ|đường dây|hối lộ|rửa tiền|đánh bạc|cờ bạc|trốn thuế|hóa đơn'],
      ['c3', 'Từ {X}, nhìn lại những vụ án tương tự từng gây chấn động', 'Bài tổng hợp', 'gợi lại vụ cũ ai cũng nhớ làm tăng lượt đọc và bình luận'],
      ['c4', '3 dấu hiệu giúp bạn không trở thành nạn nhân như trong {X}', 'Video ngắn cảnh báo', 'nội dung tự vệ thực dụng, người xem chủ động chia sẻ', 'lừa|chiếm đoạt|cướp|trộm|giả mạo|mạo danh|cưỡng đoạt'],
      ['c5', '{X}: những người bị hại giờ ra sao?', 'Phóng sự', 'góc con người phía sau con số, ít báo làm', 'lừa|chiếm đoạt|nạn nhân|bị hại|sát hại|cưỡng đoạt|xâm hại'],
      ['c6', 'Hỏi luật sư 60 giây: {X} sẽ bị xử lý thế nào?', 'Video hỏi – đáp pháp luật', 'hỏi – đáp ngắn hợp mạng xã hội và đúng thế mạnh báo pháp luật'],
      ['c7', 'Dòng thời gian {X}: từ lúc phát hiện đến hôm nay', 'Timeline', 'giúp người đến sau theo kịp câu chuyện, dễ được ghim và chia sẻ'],
    ],
    policy: [
      ['p1', '{X}: ví tiền của bạn thay đổi thế nào?', 'Infographic tính toán', 'người đọc muốn biết ngay mình được – mất gì', 'thuế|phí|lương|giá|tiền|đầu tư|tỷ|tỉ|hỗ trợ|bảo hiểm|học phí|trợ cấp|đồng'],
      ['p2', '10 câu hỏi ai cũng thắc mắc về {X}', 'Hỏi – đáp', 'dạng hỏi – đáp dễ tìm thấy trên Google và dễ chia sẻ'],
      ['p3', '{X}: ai được lợi nhất, ai phải thay đổi nhiều nhất?', 'Bảng so sánh', 'chia rõ "được – mất" kích thích bình luận, tranh luận'],
      ['p4', 'Người trẻ nghĩ gì về {X}?', 'Phỏng vấn đường phố, video dọc', 'phỏng vấn nhanh người trẻ rất hợp TikTok, Reels'],
      ['p5', 'Trước và sau {X}: 5 thay đổi trong đời sống hằng ngày', 'Infographic trước – sau', 'so sánh trực quan dễ hiểu, dễ lan'],
      ['p6', 'Trắc nghiệm: bạn hiểu đúng bao nhiêu về {X}?', 'Quiz tương tác', 'quiz kéo người đọc tương tác và thách bạn bè làm thử'],
      ['p7', '{X} giải thích trong 60 giây', 'Video ngắn', 'chính sách khô được "dịch" ngắn gọn luôn có người xem'],
    ],
    world: [
      ['w1', '{X}: chuyện gì đang thực sự diễn ra?', 'Bài giải thích 3 phút', 'khi tin dồn dập, người đọc cần một bản giải thích gọn'],
      ['w2', '3 kịch bản tiếp theo của {X}', 'Phân tích dự báo', 'dự báo khiến người đọc quay lại kiểm chứng và tranh luận'],
      ['w3', '{X} chạm tới giá xăng, giá vàng và việc làm ở Việt Nam ra sao?', 'Infographic tác động', 'kéo chuyện thế giới về túi tiền người Việt', 'dầu|xăng|iran|trung đông|thuế|thương mại|chiến|xung đột|lãi suất|fed|nga|ukraine|trung quốc|hàng không|máy bay|chip'],
      ['w4', '{X} qua 5 con số', 'Infographic số liệu', 'con số gây bất ngờ là chất liệu chia sẻ mạnh'],
      ['w5', 'Người Việt tại chỗ kể gì về {X}?', 'Phóng sự kết nối', 'góc nhìn người Việt ở nơi xảy ra sự việc, ít báo có'],
      ['w6', 'Mạng xã hội thế giới đang nói gì về {X}?', 'Tổng hợp phản ứng', 'tổng hợp bình luận, ảnh chế quốc tế rất dễ viral'],
    ],
    tech: [
      ['t1', '{X}: kiểm chứng thực tế ra sao?', 'Video trải nghiệm', 'trải nghiệm thật có sức thuyết phục và lượt xem cao'],
      ['t2', '{X} có ảnh hưởng tới điện thoại, tài khoản của bạn?', 'Hướng dẫn tự kiểm tra', 'người dùng lo cho chính mình nên chủ động bấm xem', 'điện thoại|tài khoản|ứng dụng|dịch vụ|sự cố|cập nhật|lỗi|bảo mật|mạng'],
      ['t3', 'Giải thích {X} cho người không rành công nghệ', 'Explainer bằng hình', 'nhóm độc giả lớn nhất cần một bản dễ hiểu'],
      ['t4', 'Từ {X}: 5 việc cần làm ngay để bảo vệ dữ liệu của bạn', 'Checklist', 'checklist làm được ngay được lưu và chia sẻ nhiều', 'dữ liệu|tài khoản|lừa đảo|tấn công mạng|mã độc|bảo mật|lộ|rò rỉ|hacker'],
      ['t5', '{X} mở ra cơ hội gì cho người Việt?', 'Phân tích', 'góc "cơ hội" tích cực hợp với người trẻ, giới khởi nghiệp'],
      ['t6', 'Dân mạng phản ứng thế nào trước {X}?', 'Tổng hợp phản ứng', 'tổng hợp bình luận, ảnh chế dễ lan'],
    ],
    rumor: [
      ['r1', '{X}: bắt đầu từ đâu, lan đi thế nào?', 'Infographic đường lan truyền', 'vẽ lại đường đi của một tin đồn luôn gây tò mò'],
      ['r2', 'Từ {X}: 5 dấu hiệu nhận ra tin giả trên mạng', 'Video ngắn', 'kỹ năng nhận diện tin giả được chia sẻ mạnh trong các nhóm gia đình'],
      ['r3', 'Truy vết {X}: ai tung tin, vì sao?', 'Phóng sự truy vết', 'tò mò về người đứng sau tin giả là động lực đọc lớn'],
      ['r4', 'Chia sẻ {X} có thể bị phạt bao nhiêu?', 'Hỏi – đáp pháp luật', 'người dùng mạng xã hội muốn biết mình có vô tình vi phạm không'],
      ['r5', 'Vì sao {X} dễ khiến người ta tin?', 'Phân tích tâm lý', 'giải thích tâm lý đám đông hợp với người trẻ'],
    ],
    people: [
      ['m1', 'Chân dung {X}: những điều ít ai biết', 'Longform chân dung', 'tò mò về nhân vật là động lực đọc mạnh nhất'],
      ['m2', '{X} qua 7 khoảnh khắc', 'Chuỗi ảnh, video dòng thời gian', 'định dạng lướt nhanh hợp thói quen đọc trên điện thoại'],
      ['m3', 'Bài học gì từ câu chuyện {X}?', 'Bình luận', 'góc bài học dễ được chia sẻ kèm lời bình'],
    ],
    general: [
      ['g1', '{X}: dòng thời gian từ đầu đến giờ', 'Timeline', 'giúp người đến sau theo kịp câu chuyện'],
      ['g2', 'Mạng xã hội đang nói gì về {X}?', 'Tổng hợp phản ứng', 'tổng hợp ý kiến trái chiều kích thích tranh luận'],
      ['g3', '{X} qua 5 con số đáng chú ý', 'Infographic số liệu', 'con số bất ngờ dễ được chụp lại và chia sẻ'],
      ['g4', 'Hỏi nhanh – đáp gọn về {X}', 'Hỏi – đáp', 'trả lời đúng câu người đọc đang tìm'],
      ['g5', 'Người trong cuộc kể về {X}', 'Phỏng vấn', 'góc nhìn từ bên trong mà tin vắn không có'],
      ['g6', 'Điều gì sẽ xảy ra tiếp theo với {X}?', 'Phân tích', 'câu hỏi mở khiến người đọc theo dõi tiếp'],
    ],
  };
  // các yếu tố khiến một sự kiện dễ lan truyền
  const SIGNALS = [
    [W('giá|lương|thuế|phí|tiền|lãi suất|học phí|bảo hiểm|vàng|xăng|tiền điện|giá điện|nhà ở|chung cư|tiết kiệm|nợ'), 'chạm tới túi tiền của người đọc'],
    [W('nổ|cháy|sập|tai nạn|ngộ độc|lừa đảo|dịch|bệnh|bão|lũ|sạt lở|động đất|tử vong|thiệt mạng|mất tích|an toàn'), 'liên quan trực tiếp tới an toàn của mỗi người'],
    [W('tranh cãi|xôn xao|phẫn nộ|bức xúc|gây sốc|sốc|bất ngờ|lần đầu|kỷ lục|chưa từng|bê bối|ngoại tình|bí ẩn|lạ'), 'có yếu tố bất ngờ, gây tranh luận'],
    [W('ca sĩ|diễn viên|hoa hậu|tỷ phú|tỉ phú|ceo|cầu thủ|tiktoker|kol|người nổi tiếng|nghệ sĩ|ngôi sao|influencer'), 'gắn với nhân vật được nhiều người biết'],
    [W('học sinh|sinh viên|gen z|giới trẻ|người trẻ|tuyển sinh|thi tốt nghiệp|trường học|đại học'), 'chạm tới người trẻ, nhóm chia sẻ mạnh nhất trên mạng'],
    [W('mạng xã hội|tiktok|facebook|clip|video|livestream|dân mạng|cộng đồng mạng|viral'), 'đã có dấu hiệu lan trên mạng xã hội'],
  ];
  const RUMOR = W('tin đồn|tin giả|thông tin sai sự thật|sai sự thật|bịa đặt|thất thiệt|xuyên tạc|bác bỏ thông tin|không đúng sự thật');
  const DOC = /(?<![\p{L}])(?:Luật|Bộ luật|[Nn]ghị định|[Nn]ghị quyết|[Tt]hông tư|[Dd]ự thảo|[Đđ]ề xuất|[Qq]uy định mới|[Cc]hính sách)(?![\p{L}])/u;
  // tin thủ tục, thông cáo, nhân sự: ít chất liệu để thành trend
  const TREND_SKIP = /thông cáo|kỳ họp thứ|phiên họp|cho thôi nhiệm vụ|bổ nhiệm|miễn nhiệm|phê chuẩn|bầu bổ sung|tiếp xúc cử tri|giao ban|sơ kết|tổng kết|hội nghị (triển khai|quán triệt)|ký kết hợp tác|trao quyết định/iu;
  const repText = (c) => c.rep.t + '. ' + (c.rep.sapo || '').split(/(?<=[.!?])\s/)[0];
  const typeOf = (c) => {
    const tx = repText(c);
    if (RUMOR.test(c.rep.t)) return 'rumor';
    if (c.cat === 'Khoa học Công nghệ') return 'tech';
    if (CRIME.test(tx)) return 'crime';
    if (DOC.test(c.rep.t)) return 'policy';
    if (INCIDENT.test(tx)) return 'incident';
    if (c.cat === 'Quốc tế') return 'world';
    if (c.cat === 'Khoa học Công nghệ' || DIGITAL.test(c.rep.t)) return 'tech';
    if (POLICY.test(tx) || PROJECT.test(tx) || ENACTED.test(tx)) return 'policy';
    if (SIGNALS[3][0].test(c.rep.t)) return 'people';
    return 'general';
  };
  // chủ thể của sự kiện: cụm "vụ …", tên văn bản / dự án, tên riêng lặp lại, hoặc vế đầu của tiêu đề
  const CUT = /\s+(?:khiến|làm|gây|sau khi|trước khi|vì|do|bị|được|đã|đang|sẽ|cho thấy|là|có|tại sao|như thế nào|ra sao|nhằm|để)\s+|\s*(?:[:;?!…–—|(]|,\s|\.\s)\s*/u;
  const words = (s, n) => s.split(/\s+/).slice(0, n).join(' ');
  const tidy = (s) => { let x = s.replace(/^[\s"“”'‘’]+|[\s,;:.–—-]+$/g, '').replace(/\s+(ở|tại|trong|với|đối|về|và|của|cho|từ|sau|trước|các|những)$/u, '').trim(); if (/“/.test(x) && !/”/.test(x)) x += '”'; return x; };
  const fromKey = (t, re, n) => { const m = t.match(re); if (!m) return ''; const x = tidy(words(t.slice(m.index).split(CUT)[0].split(/\s+(?:sau|trước|khi)\s+/u)[0].replace(/^\s+/, ''), n)); return x.charAt(0).toLowerCase() + x.slice(1); };
  const CRIME_KEY = /(?<![\p{L}])(lừa đảo|chiếm đoạt|tham ô|buôn lậu|hàng giả|cưỡng đoạt|ma túy|đánh bạc|sát hại|hối lộ|trộm|cướp|đường dây|tín dụng đen|rửa tiền|trốn thuế|mua bán hóa đơn)(?![\p{L}])/iu;
  const INC_KEY = /(?<![\p{L}])(vụ nổ|nổ|cháy|hỏa hoạn|sập|tai nạn|sạt lở|ngộ độc|lũ quét|lật xe|chìm tàu|đuối nước|rò rỉ|sự cố)(?![\p{L}])/iu;
  const VU = /(?<![\p{L}])(?<!(?:nhiệm|nghiệp|dịch|phục|thời|nghĩa|chức|công|quân|tạp|phụ|thương|y|thuế|điều|hàng|nông|mùa|đặc|tác)\s)((?:vụ|Vụ)\s+[^:;?!…–—|(]{4,90})/u;
  const PREFIX = /^(?:thực hư|vì sao|tại sao|toàn cảnh|cận cảnh|hé lộ|bất ngờ|nóng|video|clip|ảnh|infographic|chùm ảnh)\s*[:\-–]?\s*(?:việc\s+)?/iu;
  const PLACE = /^(Việt Nam|Hà Nội|TP\.?\s?HCM|TPHCM|TP Hồ Chí Minh|Mỹ|Trung Quốc|Nga|Nhật Bản|Hàn Quốc|Đà Nẵng|Hải Phòng|Cần Thơ|Quốc hội|Chính phủ|Bộ Chính trị|Liên hợp quốc)$/u;
  // cắt cụm danh từ dài: dừng ở giới từ gần nhất sau từ thứ 4, không cắt giữa chừng
  const BREAK = /^(của|tại|ở|trên|trong|với|đối|cho|từ|sau|trước|về|do|và|cần|phải|muốn|đề nghị|yêu cầu|kêu gọi|tiếp tục|nhằm|để|vào|theo|khi)$/u;
  const smartCut = (s, max = 10) => { const w = s.split(/\s+/).filter(Boolean); if (w.length <= max) return w.join(' '); for (let i = Math.min(max, w.length - 1); i >= 3; i--) if (BREAK.test(w[i])) return w.slice(0, i).join(' '); return ''; };
  function subjectOf(c, type) {
    const t0 = c.rep.t.replace(/^\[[^\]]+\]\s*/, '');
    const t = t0.replace(/^[\p{L}\s.]{2,25}:\s+/u, (m) => (/^(Thực hư|Vì sao|Tại sao|Toàn cảnh|Cận cảnh|Video|Clip|Ảnh|Nóng)/iu.test(m) ? '' : m)).replace(PREFIX, '');
    const low = (x) => x.charAt(0).toLowerCase() + x.slice(1);
    if (type === 'rumor') {
      const q = t.match(/[“"]([^”"]{6,70})[”"]/); if (q) return `tin đồn “${q[1].trim()}”`;
      const m = t.match(/(?:tin đồn|tin giả|sai sự thật|bịa đặt|thất thiệt|xuyên tạc)\s+(?:về\s+)?(?:việc\s+)?([^:;?!…–—|(]{6,80})/iu);
      if (m) { const x = tidy(smartCut(m[1].split(CUT)[0], 8)); if (x.split(' ').length >= 2) return 'tin đồn ' + x; }
    }
    // cụm "vụ …" lấy ở tiêu đề tiêu biểu, hoặc ở bài khác thật sự cùng sự việc với nó
    const v = [t, ...c.cl.filter((x) => x.t !== c.rep.t && sameStory(x, c.rep)).map((x) => x.t)].map((x) => x.match(VU)).find(Boolean);
    if (v) { const x = tidy(smartCut(v[1].split(/\s+(?:khiến|làm|gây|sau khi|khi|vì|do|đã|đang|bị)\s+|,\s/u)[0], 10)); if (x.split(' ').length >= 3) return low(x); }
    if (type === 'crime') { const m = t.match(CRIME_KEY); if (m) { const x = tidy(smartCut(t.slice(m.index).split(CUT)[0], 8)); if (x.split(' ').length >= 2) return 'vụ ' + low(x); } }
    if (type === 'incident') { const m = t.match(INC_KEY); if (m) { const x = low(tidy(smartCut(t.slice(m.index).split(CUT)[0].split(/\s+(?:sau|trước|khi)\s+/u)[0], 8))); if (x.split(' ').length >= 2) return /^(vụ|sự cố)\s/u.test(x) ? x : 'vụ ' + x; } }
    const d = t.match(/(?<![\p{L}])((?:Luật|Bộ luật|[Nn]ghị định|[Nn]ghị quyết|[Tt]hông tư|[Qq]uy hoạch|[Đđ]ề án|[Dd]ự án|[Cc]hương trình|[Cc]hiến dịch|[Hh]ội nghị|[Đđ]ại hội|[Ll]ễ hội|[Gg]iải|[Cc]hính sách|[Kk]ế hoạch|[Dd]ự thảo)(?:\s+[^\s:;?!…–—|(]+){1,8})/u);
    if (d) { const x = tidy(d[1].split(/\s+(?:khiến|làm|gây|được|đã|đang|sẽ|cho|tại|ở|từ|trong|nhằm|để|dài|với)\s+|,\s/u)[0]); if (x.split(' ').length >= 2) return x; }
    // tên riêng nhiều chữ lặp lại trong các bài cùng sự kiện (bỏ tên địa danh, cơ quan chung chung)
    const cnt = new Map();
    for (const x of c.cl) for (const m of x.t.matchAll(/(?<![\p{L}])(\p{Lu}[\p{L}\d]*(?:\s+\p{Lu}[\p{L}\d]*){1,4})/gu)) {
      const k = m[1]; if (PLACE.test(k) || /^(Tổng Bí thư|Chủ tịch|Thủ tướng|Bộ trưởng|Phó Thủ tướng|TP|UBND|Công an|Chủ tịch nước|Thông cáo|Trường|Bệnh viện|Sở|Bộ|Ban|Cục|Viện|Công ty|Tập đoàn|Hội|Đoàn|Học viện|Ủy ban|Tòa án|Viện kiểm sát|Ngân hàng|Quỹ|Trung tâm|Phòng|Đại học)(\s|$)/u.test(k)) continue;
      if (!t.includes(k)) continue;
      cnt.set(k, (cnt.get(k) || 0) + 1);
    }
    const best = [...cnt].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0];
    if (best && best[1] >= 2 && (type === 'people' || type === 'general')) return best[0];
    if (type === 'crime') { const q = t.match(/[“"']([^”"']{3,40})[”"']/); if (q) return `vụ án liên quan “${q[1].trim()}”`; }
    // loại chung: chỉ dùng khi cả vế đầu của tiêu đề đủ ngắn để đứng nguyên vẹn
    const seg = t.split(CUT)[0].trim();
    const n = seg.split(/\s+/).length;
    if (type === 'general' || type === 'people') return n >= 3 && n <= 10 ? tidy(seg) : '';
    if (type === 'crime' || type === 'incident' || type === 'rumor') return '';
    const head = tidy(smartCut(seg, 10));
    return head.split(' ').length >= 3 ? head : '';
  }
  const fill = (tpl, x) => {
    const lead = tpl.startsWith('{X}');
    const common = /^(Vụ|Tin|Dự|Đề|Chương|Chiến|Quy|Kế|Chính|Bắt|Khởi|Xử|Sập|Cháy|Nổ|Tai|Phê|Thông|Công|Người|Hàng|Nhiều|Các|Những|Một|Hơn|Gần|Phát|Tạm|Truy|Điều|Triệt|Cảnh|Đề|Lần|Mưa|Bão|Lũ|Sạt|Ngộ|Đường|Dòng|Giá|Học|Sinh)$/u;
    const proper = /^(\p{Lu}[\p{L}\d]*\s+\p{Lu})|^[A-Z0-9]{2,}(?![\p{Ll}])|^(Mỹ|Nga|Trung Quốc|Việt Nam|Nhật Bản|Hàn Quốc|Anh|Pháp|Đức|Ấn Độ|Ukraine|Israel|Iran|Hà Nội|TPHCM|Microsoft|Google|Apple|Meta|Nvidia|Samsung|Facebook|TikTok|Luật|Bộ luật|Nghị định|Nghị quyết|Thông tư)(?![\p{L}])/u;
    const xx = lead ? x.charAt(0).toUpperCase() + x.slice(1) : (proper.test(x) ? x : x.charAt(0).toLowerCase() + x.slice(1));
    return tpl.replace('{X}', xx);
  };
  const hash = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; };
  function suggest(slot, prevUsed) {
    const out = [], taken = [], takenX = [];
    for (const cat of categories) {
      const pool = withText.filter((c) => c.cat === cat.name && !SKIP.test(c.rep.t) && !TREND_SKIP.test(c.rep.t)).map((c) => {
        const hits = SIGNALS.filter(([re]) => re.test(c.rep.t + '. ' + (c.rep.sapo || '').split(/(?<=[.!?])\s/)[0])).map(([, label]) => label);
        const newest = Math.min(...c.cl.map(age));
        const viral = c.sources.size * 2 + Math.min(c.cl.length, 8) * 0.4 + hits.length * 1.5 + (newest < 3 ? 1.5 : newest < 8 ? 0.7 : 0);
        return { ...c, hits, newest, viral };
      }).sort((a, b) => b.viral - a.viral);
      const items = [], usedTpl = new Set();
      for (const c of pool) {
        if (items.length >= 2) break;
        if (taken.some((o) => sameStory(o.rep, c.rep))) continue;
        if (!c.hits.length && typeOf(c) === 'general') continue; // không có yếu tố lan truyền và không thuộc loại nào: bỏ qua
        taken.push(c);
        let type = typeOf(c); const X = subjectOf(c, type);
        if (!X || X.split(' ').length < 2) continue; // không rút được chủ thể gọn: bỏ sự kiện này
        const gx = grams(X).uni;
        if (takenX.some((g) => shared(g, gx) >= 2)) continue; // cùng chủ thể đã có ở mục khác
        takenX.push(gx);
        if (/^vụ\s/u.test(X) && (type === 'people' || type === 'general')) type = CRIME.test(c.text) ? 'crime' : 'incident';
        // xoay mẫu theo mốc giờ; tránh mẫu đã dùng ở mốc trước và trong cùng mục
        const ctx = (c.rep.t + ' ' + X).toLowerCase();
        const fits = (t) => !t[4] || new RegExp(t[4], 'iu').test(ctx);
        const own = IDEAS[type].filter(fits);
        const bank = [...own, ...(type === 'general' ? [] : IDEAS.general)];
        // ưu tiên mẫu riêng của loại sự kiện; trong đó ưu tiên mẫu chưa dùng ở mốc trước
        const order = bank.map((t, i) => ({ t, k: hash(slot + '|' + c.rep.u + '|' + t[0]) + (prevUsed.has(t[0]) ? 2 ** 32 : 0) + (i >= own.length ? 2 ** 34 : 0) })).sort((a, b) => a.k - b.k).map((o) => o.t);
        const ideas = [];
        for (const t of order) { if (ideas.length >= 3) break; if (usedTpl.has(t[0])) continue; usedTpl.add(t[0]); ideas.push({ id: t[0], h: fill(t[1], X), f: t[2], w: t[3] }); }
        const n = c.sources.size, k = c.cl.length;
        const pace = n > 1 ? `${n} báo đã đưa ${k} bài` : `Mới có ${c.rep.s} đưa tin`;
        const fresh = c.newest < 3 ? ', bài mới nhất chỉ cách đây ' + (c.newest < 1 ? Math.max(1, Math.round(c.newest * 60)) + ' phút' : Math.round(c.newest) + ' giờ') : '';
        const why = `${pace}${fresh}.` + (c.hits.length ? ` Sự kiện ${c.hits.slice(0, 2).join(' và ')}.` : '') + (n <= 2 ? ' Còn ít báo khai thác nên đi trước dễ tạo dấu ấn.' : '');
        items.push({ story: { t: c.rep.t, u: c.rep.u, s: c.rep.s }, n, k, subject: X, type, why, ideas });
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
  const prevUsed = new Set(((old && old.cats) || []).flatMap((c) => (c.items || []).flatMap((i) => (i.ideas || []).map((d) => d.id))));
  const topics = keep ? { ...old, next: new Date(nextMark).toISOString() } : { at: new Date().toISOString(), next: new Date(nextMark).toISOString(), cats: suggest(String(lastMark), prevUsed) };
  const nTopics = topics.cats.reduce((n, c) => n + c.items.reduce((m, i) => m + i.ideas.length, 0), 0);
  console.log(`  Ý tưởng đề tài (${keep ? 'giữ bản lúc ' + old.at : 'tạo mới'}; lần đổi tới ${topics.next}):\n` + topics.cats.map((c) => `   ${c.name}:\n` + c.items.map((t) => `     ◆ ${t.story.t} [${t.type}] → chủ thể: «${t.subject}»\n       vì sao: ${t.why}\n` + t.ideas.map((d) => `        - ${d.h}  (${d.f})`).join('\n')).join('\n')).join('\n'));

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
