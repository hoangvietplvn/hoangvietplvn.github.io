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
    items.push({ t, u, s: source, d: Number.isFinite(ms) ? new Date(ms).toISOString() : null, sapo: text(rawDesc).replace(/^\([\p{L}.\s]{3,20}\)\s*[-–]\s*/u, '').slice(0, 600), img, pos: pos++ });
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
    stories.push(...clusters.filter((c) => c.sources.size >= 2).slice(0, 12));
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

  /* ---------- gợi ý đề tài: góc chưa báo nào khai thác ----------
     Với mỗi sự việc đang được nhiều báo đưa, đối chiếu tiêu đề + phần mở đầu của tất cả các bài
     với một bộ "góc khai thác". Góc nào hợp với loại sự việc mà chưa bài nào chạm tới thì thành gợi ý. */
  const INCIDENT = /nổ|cháy|sập|tai nạn|sạt lở|ngộ độc|sự cố|tử vong|thiệt mạng|bị thương|mất tích|lũ|ngập|đuối nước|rò rỉ/iu;
  const CRIME = /bắt|khởi tố|truy tố|xét xử|tạm giam|tạm giữ|lừa đảo|đường dây|chiếm đoạt|tham ô|hối lộ|buôn lậu|hàng giả|cưỡng đoạt|sát hại|ma túy|đánh bạc|vi phạm/iu;
  const POLICY = /luật|dự thảo|đề xuất|nghị định|nghị quyết|thông tư|chính sách|quy hoạch|thí điểm|đề án|thông qua|ban hành|có hiệu lực|phê duyệt|quy định mới|sửa đổi|lấy ý kiến/iu;
  const PROJECT = /dự án|quy hoạch|đề án|chương trình|đầu tư|xây dựng|khởi công|di dời|tái thiết|hạ tầng|cao tốc|sân bay|đường sắt|metro/iu;
  const ANGLES = [
    { id: 'phap-ly', name: 'Góc pháp lý', q: 'Ai chịu trách nhiệm pháp lý và bồi thường, theo quy định nào?', what: 'trách nhiệm pháp lý hay việc bồi thường',
      has: /trách nhiệm (pháp lý|hình sự|dân sự|bồi thường)|bồi thường|chế tài|mức phạt|khung hình phạt|luật sư|theo (điều|quy định|bộ luật)|xử lý (hình sự|trách nhiệm)/iu, fit: (c) => INCIDENT.test(c.text) && !CRIME.test(c.text), cats: ['Thời sự', 'Xã hội', 'Pháp luật', 'Khoa học Công nghệ'] },
    { id: 'ke-ho', name: 'Kẽ hở quy định', q: 'Kẽ hở nào trong quy định đã bị lợi dụng, và cần vá ra sao?', what: 'kẽ hở hay bất cập của quy định hiện hành',
      has: /lỗ hổng|kẽ hở|bất cập|khoảng trống pháp lý|sửa luật|cần sửa|hoàn thiện (pháp luật|quy định|thể chế)|kiến nghị/iu, fit: (c) => CRIME.test(c.text), cats: ['Pháp luật', 'Thời sự', 'Xã hội'] },
    { id: 'tu-ve', name: 'Cẩm nang cho người dân', q: 'Người dân cần làm gì để nhận biết, phòng tránh và đòi quyền lợi?', what: 'hướng dẫn cụ thể cho người dân',
      has: /cách (nhận biết|phòng|xử lý|đòi)|cần làm gì|nên làm gì|hướng dẫn|khuyến cáo|cảnh báo|lưu ý|dấu hiệu nhận biết|quyền lợi/iu, fit: (c) => /lừa đảo|chiếm đoạt|hàng giả|giả mạo|ngộ độc|cưỡng đoạt|tín dụng đen|đa cấp|mạo danh|deepfake|tấn công mạng|lộ dữ liệu/iu.test(c.text), cats: ['Pháp luật', 'Xã hội', 'Khoa học Công nghệ', 'Thời sự'] },
    { id: 'quoc-te', name: 'So sánh quốc tế', q: 'Các nước đã xử lý vấn đề này thế nào, và bài học nào dùng được cho Việt Nam?', what: 'kinh nghiệm của các nước',
      has: /kinh nghiệm (quốc tế|các nước|thế giới|nước ngoài)|các nước|nước ngoài|quốc tế|thế giới|so với khu vực|mô hình (của|từ)|nhật bản|hàn quốc|singapore|trung quốc|châu âu|mỹ\b/iu, fit: (c) => POLICY.test(c.text), cats: ['Thời sự', 'Pháp luật', 'Xã hội', 'Khoa học Công nghệ'] },
    { id: 'viet-nam', name: 'Tác động tới Việt Nam', q: 'Diễn biến này tác động gì tới Việt Nam, doanh nghiệp và người lao động Việt?', what: 'tác động tới Việt Nam',
      has: /việt nam|người việt|doanh nghiệp việt|trong nước|hà nội|asean/iu, fit: (c) => /thuế|trừng phạt|xung đột|chiến sự|bầu cử|lãi suất|giá dầu|chip|bán dẫn|thương mại|xuất khẩu|nhập cư|visa|ai\b|nvidia|chuỗi cung ứng|lệnh cấm|đàm phán/iu.test(c.text), cats: ['Quốc tế'] },
    { id: 'thuc-thi', name: 'Khâu thực thi', q: 'Ai giám sát việc thực thi, nguồn lực ở đâu và dễ vướng ở khâu nào?', what: 'khâu giám sát và điều kiện thực thi',
      has: /giám sát|thực thi|hậu kiểm|thanh tra|khả thi|nguồn lực|lộ trình|vướng mắc|khó khăn|tổ chức thực hiện|hướng dẫn thi hành/iu, fit: (c) => /thông qua|ban hành|có hiệu lực|phê duyệt|chính thức áp dụng|bắt đầu áp dụng/iu.test(c.text), cats: ['Thời sự', 'Pháp luật', 'Xã hội', 'Khoa học Công nghệ'] },
    { id: 'kinh-phi', name: 'Bài toán kinh phí', q: 'Tiền ở đâu ra, ai chi trả và ai được hưởng lợi?', what: 'nguồn kinh phí và người chi trả',
      has: /chi phí|kinh phí|ngân sách|nguồn vốn|vốn đầu tư|tỷ đồng|tỉ đồng|triệu usd|tỷ usd|ai trả|đền bù|giải phóng mặt bằng/iu, fit: (c) => PROJECT.test(c.text), cats: ['Thời sự', 'Xã hội', 'Khoa học Công nghệ'] },
    { id: 'du-lieu', name: 'Nhìn bằng số liệu', q: 'Những vụ việc tương tự xảy ra dày đến mức nào? Thống kê nói gì về xu hướng?', what: 'số liệu thống kê hay bức tranh toàn cảnh',
      has: /thống kê|số liệu|toàn cảnh|nhìn lại|từ đầu năm|trong \d+ (năm|tháng)|\d+ vụ|tăng \d|giảm \d|cùng kỳ/iu, fit: (c) => INCIDENT.test(c.text) || CRIME.test(c.text), cats: ['Xã hội', 'Pháp luật', 'Thời sự'] },
    { id: 'rui-ro-so', name: 'Rủi ro pháp lý số', q: 'Rủi ro pháp lý, dữ liệu cá nhân và trách nhiệm của nền tảng nằm ở đâu?', what: 'rủi ro pháp lý hay dữ liệu cá nhân',
      has: /pháp lý|quyền riêng tư|dữ liệu cá nhân|bản quyền|trách nhiệm|rủi ro|an toàn thông tin|bảo mật|lừa đảo|quy định/iu, fit: (c) => /\bai\b|trí tuệ nhân tạo|chatbot|ứng dụng|nền tảng|mạng xã hội|dữ liệu|robot|camera|định danh|sinh trắc|tài sản số|tiền số|blockchain/iu.test(c.text), cats: ['Khoa học Công nghệ'] },
  ];
  const topics = [], perCat = new Map(), perAngle = new Map();
  const pool = stories.map((c) => ({ ...c, text: c.cl.map((x) => x.t + '. ' + x.sapo).join(' \n ') })).sort((a, b) => b.score - a.score);
  for (const round of [1, 2]) { // lượt 1: mỗi góc dùng một lần; lượt 2: cho phép lặp góc
    for (const c of pool) {
      if (topics.length >= 6) break;
      if (c.used || (perCat.get(c.cat) || 0) >= 2) continue;
      if (pool.some((o) => o.used && o !== c && sameStory(o.rep, c.rep))) continue; // cùng sự việc ở mục khác
      const angle = ANGLES.find((a) => a.cats.includes(c.cat) && (perAngle.get(a.id) || 0) < round && a.fit(c) && !a.has.test(c.text));
      if (!angle) continue;
      c.used = true;
      perCat.set(c.cat, (perCat.get(c.cat) || 0) + 1); perAngle.set(angle.id, (perAngle.get(angle.id) || 0) + 1);
      topics.push({
        angle: angle.name, q: angle.q, cat: c.cat, n: c.sources.size, k: c.cl.length,
        story: { t: c.rep.t, u: c.rep.u, s: c.rep.s },
        why: `${c.sources.size} báo đã đăng ${c.cl.length} bài về sự việc này, nhưng chưa bài nào nhắc tới ${angle.what} trong tiêu đề và phần mở đầu. Sự việc đang được theo dõi rộng, nên một bài đi riêng góc này có chỗ đứng.`,
      });
    }
  }
  console.log('  Gợi ý đề tài:\n' + topics.map((t) => `   · [${t.angle}] ${t.q}\n       ← ${t.story.t} (${t.n} báo, ${t.k} bài)`).join('\n'));

  fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), label: String(cfg.label || 'Tin nóng').slice(0, 30), categories, topics }));
  console.log(`→ static/news.json: ${categories.map((c) => `${c.name} ${c.items.length}/${c.hot.length}`).join(', ')}; ${topics.length} gợi ý; ${Math.round(fs.statSync(OUT).size / 1024)} KB`);
})().catch((e) => { console.log('Lỗi lấy tin: ' + (e.stack || e.message)); });
