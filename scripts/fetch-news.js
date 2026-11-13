#!/usr/bin/env node
/* Lấy tiêu đề mới từ các nguồn RSS khai báo trong news.config.json → static/news.json.
   Chạy trong GitHub Actions trước khi dựng trang. Nguồn nào lỗi thì bỏ qua, không làm hỏng lượt dựng. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'static/news.json');

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : ''; }
  return ENT[e.toLowerCase()] ?? m;
});
const text = (s = '') => decode(decode(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1] : ''; };

function parse(xml, source) {
  const items = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const it = m[0];
    const t = text(tag(it, 'title')).slice(0, 220);
    let u = text(tag(it, 'link')) || text(tag(it, 'guid'));
    if (!t || !/^https?:\/\/[^\s"'<>]+$/i.test(u)) continue;
    const ms = Date.parse(text(tag(it, 'pubDate')) || text(tag(it, 'dc:date')));
    items.push({ t, u, s: source, d: Number.isFinite(ms) ? new Date(ms).toISOString() : null });
  }
  return items;
}

async function get(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; rss-reader)', Accept: 'application/rss+xml, application/xml, text/xml, */*' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

(async () => {
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'news.config.json'), 'utf8')); } catch (e) { console.log('Không đọc được news.config.json — bỏ qua điểm tin.'); return; }
  if (!cfg.enabled) { console.log('Điểm tin đang tắt.'); fs.rmSync(OUT, { force: true }); return; }
  const per = Math.min(20, Math.max(1, +cfg.per_category || 8));
  const now = Date.now(), categories = [];
  for (const cat of cfg.categories || []) {
    const bySource = [];
    await Promise.all((cat.feeds || []).map(async (f) => {
      if (!f || !/^https:\/\//i.test(f.url || '')) return;
      try {
        const list = parse(await get(f.url), String(f.source || '').slice(0, 40))
          .filter((x) => !x.d || (now - Date.parse(x.d) < 48 * 3600e3 && Date.parse(x.d) - now < 3600e3))
          .sort((a, b) => (b.d || '').localeCompare(a.d || ''));
        console.log(`✓ ${cat.name} · ${f.source}: ${list.length} tin`);
        if (list.length) bySource.push(list);
      } catch (e) { console.log(`✗ ${cat.name} · ${f.source}: ${e.message} (${f.url})`); }
    }));
    // xen kẽ các nguồn, mỗi lượt lấy tin mới nhất của từng báo
    bySource.sort((a, b) => (b[0].d || '').localeCompare(a[0].d || ''));
    const items = [], seen = new Set();
    for (let i = 0; items.length < per && bySource.some((l) => l[i]); i++) {
      for (const l of bySource) {
        const x = l[i];
        if (!x || seen.has(x.u) || seen.has(x.t) || items.length >= per) continue;
        seen.add(x.u); seen.add(x.t); items.push(x);
      }
    }
    if (items.length) categories.push({ name: String(cat.name || '').slice(0, 40), items });
  }
  if (!categories.length) { console.log('Không lấy được tin nào — thanh tin sẽ ẩn.'); fs.rmSync(OUT, { force: true }); return; }
  fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), label: String(cfg.label || 'Tin nóng').slice(0, 30), categories }));
  console.log(`→ static/news.json: ${categories.map((c) => `${c.name} ${c.items.length}`).join(', ')}`);
})().catch((e) => { console.log('Lỗi lấy tin: ' + e.message); });
