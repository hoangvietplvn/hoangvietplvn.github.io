#!/usr/bin/env node
/* Trình dựng blog: đọc posts/*.md + pages/*.md → xuất website tĩnh vào dist/ */
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const yaml = require('js-yaml');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'dist');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));

/* ---------- tiện ích ---------- */
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const fmtDate = (d) => `${d.getUTCDate()} tháng ${d.getUTCMonth() + 1}, ${d.getUTCFullYear()}`;
const fmtDateLong = (d) => `${WEEKDAYS[d.getUTCDay()]}, ${fmtDate(d)}`;
const isoDate = (d) => d.toISOString().slice(0, 10);

function parseFile(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  let meta = {};
  if (m) {
    try { meta = yaml.load(m[1]) || {}; } catch (e) { console.warn(`! Lỗi phần khai báo đầu tệp ${path.basename(file)}: ${e.message}`); }
  }
  for (const k of Object.keys(meta)) {
    const v = meta[k];
    meta[k] = v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim();
  }
  return { meta, body: m ? m[2] : raw };
}

function write(rel, content) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === '.gitkeep') continue;
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

/* Đường dẫn bắt đầu bằng "/" trong bài viết được đổi thành tương đối,
   để site chạy đúng cả trên tên miền riêng lẫn thư mục con. */
const relativize = (html, root) => html.replace(/(src|href|poster)="\/(?!\/)/g, `$1="${root}`).replace(/url\(("?)\/(?!\/)/g, `url($1${root}`);

/* ---------- ảnh bìa tự sinh (khi bài không có ảnh) ---------- */
const PALETTES = [
  ['#1f2a2e', '#c9a25a', '#e9dfcc'], ['#6e1f2a', '#e3c9a0', '#f4ece0'], ['#23324a', '#d98b5f', '#ece4d6'],
  ['#2f3b2c', '#d6b56a', '#efe8d8'], ['#3a2a35', '#c98d7a', '#efe3da'], ['#14213d', '#b08d57', '#e5e0d5'],
];
function coverSvg(seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0), (h % 1000) / 1000);
  const [bg, a, b] = PALETTES[h % PALETTES.length];
  const cx = 300 + rnd() * 1000, cy = 260 + rnd() * 240, r = 150 + rnd() * 130;
  let lines = '';
  const horizon = 560 + rnd() * 120;
  for (let i = 0; i < 9; i++) {
    const y = horizon + i * i * 6 + i * 10;
    lines += `<rect x="0" y="${y.toFixed(0)}" width="1600" height="${(2 + i * 1.6).toFixed(1)}" fill="${b}" opacity="${(0.55 - i * 0.04).toFixed(2)}"/>`;
  }
  let arcs = '';
  for (let i = 1; i <= 4; i++) arcs += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(r + i * 46).toFixed(0)}" fill="none" stroke="${a}" stroke-width="1.2" opacity="${(0.5 - i * 0.1).toFixed(2)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice"><rect width="1600" height="900" fill="${bg}"/>${arcs}<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="${a}"/><rect x="0" y="${horizon.toFixed(0)}" width="1600" height="${(900 - horizon).toFixed(0)}" fill="${bg}"/>${lines}</svg>`;
}

/* ---------- chuyên mục (categories/*.json) ---------- */
const catDir = path.join(ROOT, 'categories');
const catDefs = (fs.existsSync(catDir) ? fs.readdirSync(catDir).filter((f) => f.endsWith('.json')) : []).map((f) => {
  let d = {};
  try { d = JSON.parse(fs.readFileSync(path.join(catDir, f), 'utf8')); } catch (e) { console.warn(`! Lỗi tệp chuyên mục ${f}: ${e.message}`); }
  const id = f.replace(/\.json$/, '');
  return { id, name: String(d.name || id).trim(), order: Number.isFinite(+d.order) ? +d.order : 999, description: String(d.description || '') };
}).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'vi'));
// bài ghi mã chuyên mục (tên tệp) hoặc ghi thẳng tên đều được
const catName = (v) => { const c = catDefs.find((x) => x.id === v || x.name === v); return c ? c.name : v; };

/* ---------- nạp bài viết ---------- */
const postsDir = path.join(ROOT, 'posts');
let posts = fs.readdirSync(postsDir).filter((f) => /\.(md|html)$/.test(f)).map((f) => {
  const { meta, body } = parseFile(path.join(postsDir, f));
  const base = f.replace(/\.(md|html)$/, '');
  const dm = base.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  const dstr = String(meta.date || '').slice(0, 10);
  const date = new Date((/^\d{4}-\d{2}-\d{2}$/.test(dstr) ? dstr : (dm && dm[1]) || isoDate(new Date())) + 'T00:00:00Z');
  const slug = slugify(meta.slug || (dm ? dm[2] : meta.title || base)) || 'bai-viet';
  const html = f.endsWith('.html') ? body : marked.parse(body);
  const text = html.replace(/<[^>]+>/g, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return {
    slug, date, html,
    title: meta.title || base,
    category: catName(meta.category || 'Ghi chép'),
    excerpt: meta.excerpt || text.trim().slice(0, 170) + '…',
    author: meta.author || cfg.author,
    cover: meta.cover || '',
    coverCaption: meta.cover_caption || '',
    layout: meta.layout || 'article',
    theme: meta.theme || '',
    draft: meta.draft === 'true',
    minutes: Math.max(1, Math.round(words / 220)),
    url: `bai-viet/${slug}/`,
  };
}).filter((p) => !p.draft).sort((a, b) => b.date - a.date || a.slug.localeCompare(b.slug));

const categories = [...new Set([...catDefs.map((c) => c.name), ...posts.map((p) => p.category)])];
const catUrl = (c) => `chuyen-muc/${slugify(c)}/`;

/* Trang tĩnh (pages/*.md) — tự hiện trên thanh điều hướng */
const pagesDir = path.join(ROOT, 'pages');
const pageList = (fs.existsSync(pagesDir) ? fs.readdirSync(pagesDir).filter((x) => x.endsWith('.md')) : []).map((f) => {
  const { meta: m, body } = parseFile(path.join(pagesDir, f));
  const slug = slugify(f.replace(/\.md$/, '')) || 'trang';
  return { slug, title: m.title || slug, excerpt: m.excerpt || '', body, url: `${slug}/` };
}).filter((p) => !['luu-tru', 'bai-viet', 'chuyen-muc', 'admin', 'assets', 'images'].includes(p.slug));

/* Mã phiên bản gắn vào đường dẫn CSS/JS để trình duyệt không dùng bản cũ đã lưu */
const VER = require('crypto').createHash('md5')
  .update(fs.readFileSync(path.join(ROOT, 'src/styles.css'))).update(fs.readFileSync(path.join(ROOT, 'src/main.js')))
  .digest('hex').slice(0, 10);

/* ---------- khung trang ---------- */
function shell({ title, description, root, body, cls = '', image = '', canonical = '' }) {
  const full = title ? `${title} — ${cfg.title}` : `${cfg.title} — ${cfg.tagline}`;
  const nav = [['', 'Trang nhất'], ...categories.map((c) => [catUrl(c), c]), ['luu-tru/', 'Lưu trữ'], ...pageList.map((p) => [p.url, p.title])]
    .map(([u, l]) => `<a href="${root}${u}">${esc(l)}</a>`).join('');
  return `<!doctype html>
<html lang="${cfg.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(description || cfg.description)}">
<meta property="og:title" content="${esc(title || cfg.title)}">
<meta property="og:description" content="${esc(description || cfg.description)}">
<meta property="og:type" content="${cls.includes('post') ? 'article' : 'website'}">
${image ? `<meta property="og:image" content="${esc(cfg.url.replace(/\/$/, '') + '/' + image)}">` : ''}
${canonical ? `<link rel="canonical" href="${esc(cfg.url.replace(/\/$/, '') + '/' + canonical)}">` : ''}
<link rel="alternate" type="application/rss+xml" title="${esc(cfg.title)}" href="${root}feed.xml">
<link rel="icon" href="${root}assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600&family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${root}assets/styles.css?v=${VER}">
</head>
<body class="${cls}">
<div class="progress" aria-hidden="true"></div>
<header class="masthead">
  <div class="topline wrap">
    <span>${fmtDateLong(new Date())}</span>
    <span class="topline-mid">Blog cá nhân · Từ ${esc(cfg.established)}</span>
    <a href="${root}feed.xml">RSS</a>
  </div>
  <div class="nameplate wrap">
    <a class="logo" href="${root}">${esc(cfg.title)}</a>
    <p class="tagline">${esc(cfg.tagline)}</p>
  </div>
  <nav class="mainnav wrap" aria-label="Chuyên mục">${nav}</nav>
</header>
<main>
${body}
</main>
<footer class="sitefoot">
  <div class="wrap">
    <a class="logo small" href="${root}">${esc(cfg.title)}</a>
    <p>© ${new Date().getUTCFullYear()} ${esc(cfg.author)}. Mọi bài viết thuộc bản quyền của tác giả.</p>
    <p class="footnav"><a href="${root}luu-tru/">Lưu trữ</a> · ${pageList.map((p) => `<a href="${root}${p.url}">${esc(p.title)}</a> · `).join('')}<a href="${root}feed.xml">RSS</a> · <a href="${root}admin/" rel="nofollow">Quản trị</a></p>
  </div>
</footer>
<script src="${root}assets/main.js?v=${VER}" defer></script>
</body>
</html>`;
}

const coverOf = (p) => (p.cover ? p.cover.replace(/^\//, '') : `assets/covers/${p.slug}.svg`);
const meta = (p) => `<p class="meta"><time datetime="${isoDate(p.date)}">${fmtDate(p.date)}</time><span>${p.minutes} phút đọc</span></p>`;
const kicker = (p, root) => `<a class="kicker" href="${root}${catUrl(p.category)}">${esc(p.category)}</a>`;

function card(p, root, { image = true, big = false } = {}) {
  return `<article class="card${big ? ' card-lead' : ''}">
  ${image ? `<a class="thumb" href="${root}${p.url}" tabindex="-1" aria-hidden="true"><img src="${root}${coverOf(p)}" alt="" loading="lazy"></a>` : ''}
  <div class="card-body">
    ${kicker(p, root)}
    <h${big ? 2 : 3} class="headline"><a href="${root}${p.url}">${esc(p.title)}</a></h${big ? 2 : 3}>
    <p class="excerpt">${esc(p.excerpt)}</p>
    ${meta(p)}
  </div>
</article>`;
}

/* ---------- dựng ---------- */
fs.rmSync(OUT, { recursive: true, force: true });
copyDir(path.join(ROOT, 'static'), OUT);
write('assets/styles.css', fs.readFileSync(path.join(ROOT, 'src/styles.css')));
write('assets/main.js', fs.readFileSync(path.join(ROOT, 'src/main.js')));
// Trang quản trị: chép bộ mã CMS vào dist/admin/
{
  const cms = path.join(ROOT, 'node_modules/@sveltia/cms/dist');
  if (fs.existsSync(cms)) {
    write('admin/sveltia-cms.js', fs.readFileSync(path.join(cms, 'sveltia-cms.js')));
    const walk = (dir, rel) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name), `${rel}/${e.name}`);
      else if (!e.name.endsWith('.map')) write(`admin/${rel}/${e.name}`, fs.readFileSync(path.join(dir, e.name)));
    } };
    if (fs.existsSync(path.join(cms, 'chunks'))) walk(path.join(cms, 'chunks'), 'chunks');
  }
}
write('assets/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#16130f"/><text x="32" y="46" font-family="Georgia,serif" font-size="40" font-weight="700" text-anchor="middle" fill="#f6f1e7">${esc(cfg.title.trim()[0] || 'B')}</text></svg>`);
for (const p of posts) if (!p.cover) write(`assets/covers/${p.slug}.svg`, coverSvg(p.slug));

// Trang nhất
{
  // homepage.json (sửa trong trang quản trị, mục "Trang nhất") quyết định bài nào hiện ở đây
  let home = {};
  try { home = JSON.parse(fs.readFileSync(path.join(ROOT, 'homepage.json'), 'utf8')); } catch (e) { /* không có tệp: chế độ tự động */ }
  const bySlug = new Map(posts.map((p) => [p.slug, p]));
  const pick = (v) => (Array.isArray(v) ? v : []).map((x) => bySlug.get(typeof x === 'string' ? x : x && x.post)).filter(Boolean);
  let lead, side, more;
  if (home.mode === 'manual') {
    const seen = new Set();
    const uniq = (list) => list.filter((p) => !seen.has(p.slug) && seen.add(p.slug));
    const all = uniq([bySlug.get(home.lead), ...pick(home.side), ...pick(home.more)].filter(Boolean));
    lead = bySlug.get(home.lead) || all[0];
    seen.clear(); if (lead) seen.add(lead.slug);
    side = uniq(pick(home.side)); more = uniq(pick(home.more));
  }
  if (!lead) { [lead] = posts; side = posts.slice(1, 4); more = posts.slice(4, 13); }
  const sideLabel = home.side_label || 'Đáng đọc', moreLabel = home.more_label || 'Mới đăng';
  const body = !lead ? '<div class="wrap empty"><p>Chưa có bài viết nào.</p></div>' : `
<section class="front wrap${side.length ? '' : ' front-solo'}">
  <div class="front-lead">${card(lead, '', { big: true })}</div>
  ${side.length ? `<aside class="front-side">
    <h2 class="label">${esc(sideLabel)}</h2>
    ${side.map((p) => card(p, '', { image: false })).join('\n')}
  </aside>` : ''}
</section>
${more.length ? `<section class="wrap">
  <h2 class="label rule">${esc(moreLabel)}</h2>
  <div class="grid">${more.map((p) => card(p, '')).join('\n')}</div>
</section>` : ''}
<section class="wrap allposts"><a class="btn" href="luu-tru/">Xem toàn bộ kho lưu trữ →</a></section>`;
  write('index.html', shell({ root: '', body, cls: 'home', canonical: '' }));
}

// Bài viết
posts.forEach((p, i) => {
  const root = '../../';
  const newer = posts[i - 1], older = posts[i + 1];
  const cover = root + coverOf(p);
  const head = p.layout === 'longform' ? `
<header class="lf-hero" style="background-image:url('${cover}')">
  <div class="lf-hero-inner">
    ${kicker(p, root)}
    <h1>${esc(p.title)}</h1>
    <p class="standfirst">${esc(p.excerpt)}</p>
    <p class="byline">Bài: <strong>${esc(p.author)}</strong> · ${fmtDate(p.date)} · ${p.minutes} phút đọc</p>
  </div>
</header>` : `
<header class="post-head">
  ${kicker(p, root)}
  <h1>${esc(p.title)}</h1>
  <p class="standfirst">${esc(p.excerpt)}</p>
  <p class="byline">Bài: <strong>${esc(p.author)}</strong> · <time datetime="${isoDate(p.date)}">${fmtDateLong(p.date)}</time> · ${p.minutes} phút đọc</p>
</header>
<figure class="post-cover"><img src="${cover}" alt="">${p.coverCaption ? `<figcaption>${esc(p.coverCaption)}</figcaption>` : ''}</figure>`;
  const article = p.layout === 'custom'
    ? `<article class="post-article">
${relativize(p.html, root)}
</article>`
    : `<article class="post-article">
${head}
<div class="prose">
${relativize(p.html, root)}
<p class="endmark" aria-hidden="true">◆</p>
</div>
</article>`;
  const body = `
${article}
<nav class="pager wrap" aria-label="Bài khác">
  ${older ? `<a class="prev" href="${root}${older.url}"><span>← Bài trước</span>${esc(older.title)}</a>` : '<span></span>'}
  ${newer ? `<a class="next" href="${root}${newer.url}"><span>Bài sau →</span>${esc(newer.title)}</a>` : '<span></span>'}
</nav>`;
  write(`${p.url}index.html`, shell({ title: p.title, description: p.excerpt, root, body, cls: `post ${p.layout}${p.theme ? ' theme-' + p.theme : ''}`, image: coverOf(p), canonical: p.url }));
});

// Chuyên mục
for (const c of categories) {
  const list = posts.filter((p) => p.category === c);
  const body = `<section class="wrap"><header class="page-head"><p class="kicker">Chuyên mục</p><h1>${esc(c)}</h1><p class="count">${esc((catDefs.find((x) => x.name === c) || {}).description || `${list.length} bài viết`)}</p></header>
${list.length ? `<div class="grid">${list.map((p) => card(p, '../../')).join('\n')}</div>` : '<p class="empty">Chưa có bài viết trong chuyên mục này.</p>'}</section>`;
  write(`${catUrl(c)}index.html`, shell({ title: c, root: '../../', body, cls: 'category', canonical: catUrl(c) }));
}

// Lưu trữ
{
  const years = [...new Set(posts.map((p) => p.date.getUTCFullYear()))];
  const body = `<section class="wrap narrow"><header class="page-head"><p class="kicker">Kho bài viết</p><h1>Lưu trữ</h1><p class="count">${posts.length} bài viết</p></header>
<input class="search" type="search" placeholder="Tìm theo tiêu đề, chuyên mục…" aria-label="Tìm bài viết" data-filter>
${years.map((y) => `<section class="year" data-year><h2>${y}</h2><ul>
${posts.filter((p) => p.date.getUTCFullYear() === y).map((p) => `<li data-item><time datetime="${isoDate(p.date)}">${String(p.date.getUTCDate()).padStart(2, '0')}/${String(p.date.getUTCMonth() + 1).padStart(2, '0')}</time><a href="../${p.url}">${esc(p.title)}</a><span class="tag">${esc(p.category)}</span></li>`).join('\n')}
</ul></section>`).join('\n')}
<p class="noresult" hidden>Không tìm thấy bài viết phù hợp.</p></section>`;
  write('luu-tru/index.html', shell({ title: 'Lưu trữ', root: '../', body, cls: 'archive', canonical: 'luu-tru/' }));
}

// Trang tĩnh (pages/*.md)
for (const pg of pageList) {
  const body = `<article class="post-article"><header class="post-head"><h1>${esc(pg.title)}</h1>${pg.excerpt ? `<p class="standfirst">${esc(pg.excerpt)}</p>` : ''}</header>
<div class="prose nodrop">${relativize(marked.parse(pg.body), '../')}</div></article>`;
  write(`${pg.url}index.html`, shell({ title: pg.title, root: '../', body, cls: 'page', canonical: pg.url }));
}

// Trang quản trị: điền danh sách bài vào các ô chọn của mục "Trang nhất"
{
  const cfgFile = path.join(ROOT, 'static/admin/config.yml');
  if (fs.existsSync(cfgFile)) {
    const pad = (n) => String(n).padStart(2, '0');
    const opts = posts.map((p) => ({ label: `${pad(p.date.getUTCDate())}/${pad(p.date.getUTCMonth() + 1)}/${p.date.getUTCFullYear()} — ${p.title}`, value: p.slug }));
    if (!opts.length) opts.push({ label: '(chưa có bài viết)', value: '' });
    write('admin/config.yml', fs.readFileSync(cfgFile, 'utf8').split('__POST_OPTIONS__').join(JSON.stringify(opts)));
  }
}

// 404, RSS, sitemap, CNAME
write('404.html', shell({ title: 'Không tìm thấy trang', root: '/', cls: 'page',
  body: '<section class="wrap narrow page-head"><p class="kicker">Lỗi 404</p><h1>Trang này không tồn tại</h1><p><a class="btn" href="/">Về trang nhất</a></p></section>' }));
const base = cfg.url.replace(/\/$/, '');
write('feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>${esc(cfg.title)}</title><link>${base}/</link><description>${esc(cfg.description)}</description><language>${cfg.language}</language>
${posts.slice(0, 30).map((p) => `<item><title>${esc(p.title)}</title><link>${base}/${p.url}</link><guid>${base}/${p.url}</guid><pubDate>${p.date.toUTCString()}</pubDate><description>${esc(p.excerpt)}</description></item>`).join('\n')}
</channel></rss>`);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['', 'luu-tru/', ...pageList.map((p) => p.url), ...categories.map((c) => catUrl(c)), ...posts.map((p) => p.url)].map((u) => `<url><loc>${base}/${u}</loc></url>`).join('\n')}
</urlset>`);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
if (cfg.domain) write('CNAME', cfg.domain + '\n');
write('.nojekyll', '');

console.log(`✓ Đã dựng ${posts.length} bài viết, ${categories.length} chuyên mục → dist/`);
