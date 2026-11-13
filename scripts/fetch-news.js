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
    if (!t || !u) continue;
    const rawDesc = decode(uncdata(tag(it, 'description')));
    const img = httpUrl(decode((rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i) || it.match(/<(?:enclosure|media:content|media:thumbnail)[^>]+url=["']([^"']+)["']/i) || [])[1] || '').trim());
    const ms = Date.parse(text(tag(it, 'pubDate')) || text(tag(it, 'dc:date')));
    items.push({ t, u, s: source, d: Number.isFinite(ms) ? new Date(ms).toISOString() : null, sapo: text(rawDesc).slice(0, 600), img, pos: pos++ });
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
const shared = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n; };
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

const FUTURE = /(từ (?:ngày )?\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|từ (?:tháng|năm|quý) [\dIV]+(?:[/-]\d{4})?|(?:trong |đầu |cuối |đến )?năm 20(?:2[7-9]|3\d)|sắp (?:tới|diễn ra|có hiệu lực|được|ra mắt|áp dụng|xét xử|khởi công|thông xe|vận hành)|dự kiến [^,.;]{3,40}|đề xuất [^,.;]{3,40}|dự thảo [^,.;]{3,40}|lấy ý kiến [^,.;]{3,40}|trình Quốc hội|có hiệu lực [^,.;]{0,30}|sẽ (?:được |bị |chính thức |bắt đầu |áp dụng |xét xử |diễn ra |tăng |giảm |cấm |thí điểm )[^,.;]{0,40})/iu;
const GENERIC = new Set(['việt nam', 'hà nội', 'tp hcm', 'thành phố', 'tổng thống', 'thủ tướng', 'bộ trưởng', 'công an', 'chủ tịch', 'tổng bí', 'bí thư', 'quốc hội', 'chính phủ', 'trung quốc', 'đà nẵng', 'thế giới', 'hồ chí', 'chí minh', 'hồ chí minh', 'tổng bí thư', 'bí thư chủ', 'chủ tịch nước']);
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
  const now = Date.now(), categories = [], everything = [];
  const age = (x) => (x.d ? (now - Date.parse(x.d)) / HOUR : 12);
  const slim = (x) => ({ t: x.t, u: x.u, s: x.s, d: x.d });

  for (const cat of cfg.categories || []) {
    const name = String(cat.name || '').slice(0, 40);
    const bySource = new Map();
    await Promise.all((cat.feeds || []).map(async (f) => {
      if (!f || !/^https:\/\//i.test(f.url || '')) return;
      const source = String(f.source || '').slice(0, 40);
      try {
        const list = parse(await get(f.url), source).filter((x) => !x.d || (now - Date.parse(x.d) < 48 * HOUR && Date.parse(x.d) - now < HOUR));
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
    const clusters = cluster(all.filter((x) => age(x) <= 30)).map((cl) => {
      const sources = new Set(cl.map((x) => x.s));
      const newest = Math.min(...cl.map(age));
      const top = Math.min(...cl.map((x) => x.pos));
      const score = sources.size * 3 + Math.min(cl.length, 6) * 0.5 + (newest < 3 ? 2 : newest < 8 ? 1 : newest < 16 ? 0.3 : 0) + Math.max(0, (8 - top) / 8);
      const rep = [...cl].sort((a, b) => (b.img ? 1 : 0) + (b.sapo.length > 60 ? 1 : 0) - ((a.img ? 1 : 0) + (a.sapo.length > 60 ? 1 : 0)) || (b.d || '').localeCompare(a.d || ''))[0];
      return { cl, sources, score, rep };
    }).sort((a, b) => b.score - a.score).slice(0, 5);
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

  /* ---------- gợi ý đề tài ---------- */
  const topics = [], used = new Set();
  const refs = (list) => { const out = [], had = new Set(); for (const x of list) { if (had.has(x.s) || out.length >= 2) continue; had.add(x.s); out.push({ t: x.t, u: x.u, s: x.s }); } return out; };
  // (1) sự việc vừa nổi lên: nhiều báo cùng đưa trong vài giờ gần đây nhưng chưa vào nhóm tin nóng
  const FRESH = 8;
  const short = (t) => (t.length > 90 ? t.slice(0, 88).replace(/\s+\S*$/, '') + '…' : t);
  const emerging = cluster(everything.filter((x) => !x.hot && x.d && age(x) <= FRESH)).map((cl) => {
    const src = new Set(cl.map((x) => x.s)), newest = Math.min(...cl.map(age)), oldest = Math.max(...cl.map(age));
    return { cl: cl.sort((a, b) => (b.d || '').localeCompare(a.d || '')), src, newest, oldest, score: src.size * 2 + cl.length * 0.5 + (newest < 1.5 ? 2 : newest < 3 ? 1 : 0) + (oldest < 4 ? 1 : 0) };
  }).filter((c) => c.src.size >= 2).sort((a, b) => b.score - a.score);
  const perCatRise = new Map();
  const mins = (h) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} phút` : `${Math.round(h)} giờ`);
  for (const c of emerging) {
    if (topics.length >= 4) break;
    const x = c.cl[0];
    if ((perCatRise.get(x.cat) || 0) >= 2) continue;
    perCatRise.set(x.cat, (perCatRise.get(x.cat) || 0) + 1);
    c.cl.forEach((y) => used.add(y.u));
    topics.push({
      label: short(x.t), cat: x.cat, kind: 'rising',
      why: `${c.src.size} báo cùng đưa trong ${mins(Math.max(c.oldest, 1))} qua (${c.cl.length} bài), bài mới nhất cách đây ${mins(c.newest)}. Sự việc còn ở giai đoạn đầu và chưa vào nhóm 5 tin nóng, nên còn dư địa để đi trước.`,
      refs: refs(c.cl),
    });
  }
  // (2) sự việc có mốc thời gian phía trước
  const upcoming = cluster(everything.filter((x) => age(x) <= 36 && !used.has(x.u) && FUTURE.test(x.t + '. ' + x.sapo))).map((cl) => {
    const hit = cl.map((x) => ({ x, m: (x.t + '. ' + x.sapo).match(FUTURE) })).find((h) => h.m);
    return { cl, hit, src: new Set(cl.map((x) => x.s)), inTitle: cl.some((x) => FUTURE.test(x.t)) };
  }).filter((c) => c.hit).sort((a, b) => b.src.size * 2 + (b.inTitle ? 1.5 : 0) + b.cl.length * 0.3 - (a.src.size * 2 + (a.inTitle ? 1.5 : 0) + a.cl.length * 0.3));
  const perCat = new Map();
  for (const c of upcoming) {
    if (topics.length >= 6) break;
    const x = c.hit.x;
    if ((perCat.get(x.cat) || 0) >= 1) continue;
    perCat.set(x.cat, 1);
    topics.push({
      label: short(x.t), cat: x.cat, kind: 'upcoming',
      why: `Có mốc phía trước: “${c.hit.m[0].trim().replace(/\s+\S*$/, (w) => (c.hit.m[0].trim().length >= 40 ? '' : w))}”. ${c.src.size > 1 ? c.src.size + ' báo đã đưa tin; đ' : 'Đ'}ề tài kiểu này thường nóng lại khi đến hạn hoặc khi có quyết định chính thức.`,
      refs: refs(c.cl),
    });
  }
  console.log('  Gợi ý đề tài:\n' + topics.map((t) => `   · [${t.kind}] ${t.label} — ${t.why}`).join('\n'));

  fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), label: String(cfg.label || 'Tin nóng').slice(0, 30), categories, topics }));
  console.log(`→ static/news.json: ${categories.map((c) => `${c.name} ${c.items.length}/${c.hot.length}`).join(', ')}; ${topics.length} gợi ý; ${Math.round(fs.statSync(OUT).size / 1024)} KB`);
})().catch((e) => { console.log('Lỗi lấy tin: ' + (e.stack || e.message)); });
