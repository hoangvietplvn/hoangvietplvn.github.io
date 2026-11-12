#!/usr/bin/env node
/* Trình dựng blog: đọc posts/*.md + pages/*.md → xuất website tĩnh vào dist/ */
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

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
  const meta = {};
  if (m) {
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':');
      if (i < 1) continue;
      meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
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
const relativize = (html, root) => html.replace(/(src|href|poster)="\/(?!\/)/g, `$1="${root}`);

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

/* ---------- nạp bài viết ---------- */
const postsDir = path.join(ROOT, 'posts');
let posts = fs.readdirSync(postsDir).filter((f) => /\.(md|html)$/.test(f)).map((f) => {
  const { meta, body } = parseFile(path.join(postsDir, f));
  const base = f.replace(/\.(md|html)$/, '');
  const dm = base.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  const date = new Date((meta.date || (dm && dm[1]) || isoDate(new Date())) + 'T00:00:00Z');
  const slug = meta.slug || (dm ? dm[2] : slugify(meta.title || base));
  const html = f.endsWith('.html') ? body : marked.parse(body);
  const text = html.replace(/<[^>]+>/g, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return {
    slug, date, html,
    title: meta.title || base,
    category: meta.category || 'Ghi chép',
    excerpt: meta.excerpt || text.trim().slice(0, 170) + '…',
    author: meta.author || cfg.author,
    cover: meta.cover || '',
    coverCaption: meta.cover_caption || '',
    layout: meta.layout || 'article',
    draft: meta.draft === 'true',
    minutes: Math.max(1, Math.round(words / 220)),
    url: `bai-viet/${slug}/`,
  };
}).filter((p) => !p.draft).sort((a, b) => b.date - a.date || a.slug.localeCompare(b.slug));

const categories = [...new Set(posts.map((p) => p.category))];
const catUrl = (c) => `chuyen-muc/${slugify(c)}/`;

/* ---------- khung trang ---------- */
function shell({ title, description, root, body, cls = '', image = '', canonical = '' }) {
  const full = title ? `${title} — ${cfg.title}` : `${cfg.title} — ${cfg.tagline}`;
  const nav = [['', 'Trang nhất'], ...categories.map((c) => [catUrl(c), c]), ['luu-tru/', 'Lưu trữ'], ['gioi-thieu/', 'Giới thiệu']]
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
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600&family=Playfair+Display:ital,wght@0,400;0,600;0,800;0,900;1,400;1,600&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${root}assets/styles.css">
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
    <p class="footnav"><a href="${root}luu-tru/">Lưu trữ</a> · <a href="${root}gioi-thieu/">Giới thiệu</a> · <a href="${root}feed.xml">RSS</a></p>
  </div>
</footer>
<script src="${root}assets/main.js" defer></script>
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
write('assets/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#16130f"/><text x="32" y="46" font-family="Georgia,serif" font-size="40" font-weight="700" text-anchor="middle" fill="#f6f1e7">${esc(cfg.title.trim()[0] || 'B')}</text></svg>`);
for (const p of posts) if (!p.cover) write(`assets/covers/${p.slug}.svg`, coverSvg(p.slug));

// Trang nhất
{
  const [lead, ...rest] = posts;
  const side = rest.slice(0, 3), more = rest.slice(3);
  const body = !lead ? '<div class="wrap empty"><p>Chưa có bài viết nào.</p></div>' : `
<section class="front wrap">
  <div class="front-lead">${card(lead, '', { big: true })}</div>
  <aside class="front-side">
    <h2 class="label">Đáng đọc</h2>
    ${side.map((p) => card(p, '', { image: false })).join('\n')}
  </aside>
</section>
${more.length ? `<section class="wrap">
  <h2 class="label rule">Mới đăng</h2>
  <div class="grid">${more.slice(0, 9).map((p) => card(p, '')).join('\n')}</div>
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
  const body = `
<article class="post-article">
${head}
<div class="prose">
${relativize(p.html, root)}
<p class="endmark" aria-hidden="true">◆</p>
</div>
</article>
<nav class="pager wrap" aria-label="Bài khác">
  ${older ? `<a class="prev" href="${root}${older.url}"><span>← Bài trước</span>${esc(older.title)}</a>` : '<span></span>'}
  ${newer ? `<a class="next" href="${root}${newer.url}"><span>Bài sau →</span>${esc(newer.title)}</a>` : '<span></span>'}
</nav>`;
  write(`${p.url}index.html`, shell({ title: p.title, description: p.excerpt, root, body, cls: `post ${p.layout}`, image: coverOf(p), canonical: p.url }));
});

// Chuyên mục
for (const c of categories) {
  const list = posts.filter((p) => p.category === c);
  const body = `<section class="wrap"><header class="page-head"><p class="kicker">Chuyên mục</p><h1>${esc(c)}</h1><p class="count">${list.length} bài viết</p></header>
<div class="grid">${list.map((p) => card(p, '../../')).join('\n')}</div></section>`;
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
const pagesDir = path.join(ROOT, 'pages');
for (const f of fs.existsSync(pagesDir) ? fs.readdirSync(pagesDir).filter((x) => x.endsWith('.md')) : []) {
  const { meta: m, body: md } = parseFile(path.join(pagesDir, f));
  const slug = f.replace(/\.md$/, '');
  const body = `<article class="post-article"><header class="post-head"><h1>${esc(m.title || slug)}</h1>${m.excerpt ? `<p class="standfirst">${esc(m.excerpt)}</p>` : ''}</header>
<div class="prose nodrop">${relativize(marked.parse(md), '../')}</div></article>`;
  write(`${slug}/index.html`, shell({ title: m.title || slug, root: '../', body, cls: 'page', canonical: `${slug}/` }));
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
${['', 'luu-tru/', 'gioi-thieu/', ...posts.map((p) => p.url)].map((u) => `<url><loc>${base}/${u}</loc></url>`).join('\n')}
</urlset>`);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
if (cfg.domain) write('CNAME', cfg.domain + '\n');
write('.nojekyll', '');

console.log(`✓ Đã dựng ${posts.length} bài viết, ${categories.length} chuyên mục → dist/`);
