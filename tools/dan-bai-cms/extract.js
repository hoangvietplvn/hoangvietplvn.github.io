// Bóc tách bài báo từ HTML: tiêu đề, sapo, nội dung sạch, tác giả, nguồn.
/* global Readability */

const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'VIDEO', 'AUDIO', 'FORM', 'BUTTON', 'INPUT', 'SELECT',
  'TEXTAREA', 'SVG', 'NOSCRIPT', 'OBJECT', 'EMBED', 'LINK', 'META', 'CANVAS', 'TEMPLATE']);
const KEEP = {
  P: [], H2: [], H3: [], H4: [], STRONG: [], B: [], EM: [], I: [], U: [], SUB: [], SUP: [], BR: [],
  UL: [], OL: [], LI: [], BLOCKQUOTE: [], FIGURE: [], FIGCAPTION: [],
  TABLE: [], THEAD: [], TBODY: [], TR: [], TD: ['colspan', 'rowspan'], TH: ['colspan', 'rowspan'],
  A: ['href'], IMG: ['src', 'alt'],
};
const BLOCKS = 'P,H2,H3,H4,UL,OL,BLOCKQUOTE,FIGURE,TABLE,DIV,SECTION,ARTICLE';

const safeUrl = (u) => /^https?:\/\//i.test(u || '');
const absUrl = (u, base) => { try { const r = new URL(u, base).href; return safeUrl(r) ? r : ''; } catch (e) { return ''; } };
const plain = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

function cleanNode(node, doc) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === Node.COMMENT_NODE) { child.remove(); continue; }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    let tag = child.tagName.toUpperCase();
    if (DROP.has(tag)) { child.remove(); continue; }
    cleanNode(child, doc);
    if (tag === 'H1') tag = 'H2';
    if (tag === 'H5' || tag === 'H6') tag = 'H4';
    if (!(tag in KEEP)) {
      // Thẻ bao (div, span, section...): khối chỉ chứa chữ thì thành đoạn văn, còn lại thì gỡ vỏ.
      const isBlock = /^(DIV|SECTION|ARTICLE|MAIN|HEADER|FOOTER|ASIDE|CENTER)$/.test(tag);
      if (isBlock && child.textContent.trim() && !child.querySelector(BLOCKS + ',IMG')) {
        const p = doc.createElement('p');
        p.append(...child.childNodes);
        child.replaceWith(p);
      } else {
        child.replaceWith(...child.childNodes);
      }
      continue;
    }
    const el = tag === child.tagName.toUpperCase() ? child : doc.createElement(tag);
    if (el !== child) { el.append(...child.childNodes); }
    const allowed = KEEP[tag];
    const attrs = {};
    for (const a of allowed) if (child.hasAttribute(a)) attrs[a] = child.getAttribute(a);
    for (const a of [...el.attributes]) el.removeAttribute(a.name);
    for (const [k, v] of Object.entries(attrs)) {
      if ((k === 'href' || k === 'src') && !safeUrl(v)) continue;
      el.setAttribute(k, v);
    }
    if (el !== child) child.replaceWith(el);
    if (tag === 'IMG' && !el.getAttribute('src')) { el.remove(); continue; }
    if (tag === 'A' && !el.getAttribute('href')) { el.replaceWith(...el.childNodes); continue; }
    if (/^(P|H2|H3|H4|LI|FIGURE|FIGCAPTION|BLOCKQUOTE|STRONG|B|EM|I|U)$/.test(tag) &&
        !el.textContent.trim() && !el.querySelector('img')) el.remove();
  }
}

// Làm sạch một đoạn HTML bất kỳ, chỉ giữ các thẻ trình bày cơ bản.
function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
  cleanNode(doc.body, doc);
  return doc.body.innerHTML.trim();
}

function meta(doc, ...names) {
  for (const n of names) {
    const el = doc.querySelector(`meta[property="${n}"], meta[name="${n}"]`);
    const v = el && el.getAttribute('content');
    if (v && v.trim()) return v.trim();
  }
  return '';
}

function parseArticle(html, url) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('base').forEach((b) => b.remove());
  const base = doc.createElement('base');
  base.href = url;
  doc.head.prepend(base);

  // Ảnh tải chậm (lazy-load): lấy địa chỉ thật từ data-src...
  doc.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || '';
    const lazy = ['data-src', 'data-original', 'data-lazy-src', 'data-lazy', 'data-url']
      .map((a) => img.getAttribute(a)).find(Boolean);
    if (lazy && (!src || src.startsWith('data:') || /blank|placeholder|loading|grey\.gif/i.test(src))) {
      img.setAttribute('src', lazy);
    }
    img.removeAttribute('srcset');
  });
  doc.querySelectorAll('picture source').forEach((s) => s.remove());
  // Bỏ các khối quảng cáo chen giữa bài.
  doc.querySelectorAll('[class], [id]').forEach((el) => {
    const mark = (el.getAttribute('class') || '') + ' ' + (el.id || '');
    if (/(^|[\s_-])(ads?|advert\w*|adsbygoogle|quang-?cao|banner)([\s_-]|$)/i.test(mark) && !el.querySelector('article, h1')) el.remove();
  });

  const info = {
    url,
    ogTitle: meta(doc, 'og:title', 'twitter:title'),
    sapo: meta(doc, 'og:description', 'description', 'twitter:description'),
    cover: meta(doc, 'og:image', 'twitter:image'),
    site: meta(doc, 'og:site_name'),
    author: meta(doc, 'author', 'article:author'),
  };
  const h1 = doc.querySelector('h1');
  const h1Text = h1 ? h1.textContent.replace(/\s+/g, ' ').trim() : '';

  const art = new Readability(doc).parse();
  if (!art || !art.content) throw new Error('Không nhận diện được nội dung bài báo trên trang này.');

  const title = h1Text || art.title || info.ogTitle;
  const sapo = info.sapo || art.excerpt || '';
  const body = new DOMParser().parseFromString('<body>' + art.content + '</body>', 'text/html');
  cleanNode(body.body, body);

  // Bỏ tiêu đề và sapo bị lặp lại ở đầu phần nội dung.
  for (let i = 0; i < 3; i++) {
    const first = body.body.firstElementChild;
    if (!first || first.querySelector('img')) break;
    const t = plain(first.textContent);
    const s = plain(sapo).replace(/(\.\.\.|…)$/, '');
    if (t && (t === plain(title) || (s.length > 30 && (t === s || t.startsWith(s) || s.startsWith(t))))) first.remove();
    else break;
  }

  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { /* bỏ qua */ }
  return {
    url,
    title,
    sapo,
    html: body.body.innerHTML.trim(),
    author: (art.byline || info.author || '').replace(/\s+/g, ' ').trim(),
    site: art.siteName || info.site || host,
    cover: absUrl(info.cover, url),
    length: body.body.textContent.trim().length,
  };
}

async function fetchHtml(url) {
  const res = await fetch(url, { credentials: 'omit', redirect: 'follow' });
  if (!res.ok) throw new Error('Trang báo trả về lỗi ' + res.status);
  const buf = await res.arrayBuffer();
  let charset = (/charset=([\w-]+)/i.exec(res.headers.get('content-type') || '') || [])[1];
  if (!charset) {
    const head = new TextDecoder('latin1').decode(buf.slice(0, 2048));
    charset = (/charset=["']?([\w-]+)/i.exec(head) || [])[1];
  }
  let dec;
  try { dec = new TextDecoder(charset || 'utf-8'); } catch (e) { dec = new TextDecoder('utf-8'); }
  return dec.decode(buf);
}

// ---------- Google Docs ----------
// Đọc bản xuất HTML của tài liệu Google Docs. Không bắt buộc, nhưng nên viết như sau ở đầu tài liệu:
//   Tiêu đề: …   Sapo: … (hoặc Tóm tắt: …)   Tác giả: …   Danh mục: …   Ảnh đại diện: <link ảnh>
//   Nội dung:   (từ dòng này trở xuống là nội dung bài)
// Không có nhãn thì: đoạn đầu là tiêu đề, đoạn ngắn kế tiếp là sapo, phần còn lại là nội dung.
function docFromHtml(html, url) {
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Chữ đậm / nghiêng: Google Docs đặt trong lớp CSS gắn vào span.
  const bold = new Set(); const ital = new Set();
  doc.querySelectorAll('style').forEach((st) => {
    const re = /\.([\w-]+)\s*\{([^}]*)\}/g; let m;
    while ((m = re.exec(st.textContent))) {
      if (/font-weight\s*:\s*(700|800|900|bold)/i.test(m[2])) bold.add(m[1]);
      if (/font-style\s*:\s*italic/i.test(m[2])) ital.add(m[1]);
    }
  });
  const wrap = (el, tag) => { const w = doc.createElement(tag); el.replaceWith(w); w.appendChild(el); return w; };
  doc.querySelectorAll('body span').forEach((sp) => {
    const cls = [...sp.classList];
    const b = cls.some((c) => bold.has(c)); const i = cls.some((c) => ital.has(c));
    let node = sp;
    if (i) node = wrap(node, 'em');
    if (b) wrap(node, 'strong');
  });

  const items = [...doc.body.children].filter((el) => clean(el.textContent) || el.querySelector('img'));
  const LABEL = { 'tieu de': 'title', 'sapo': 'sapo', 'tom tat': 'sapo', 'tac gia': 'author', 'danh muc': 'category', 'anh dai dien': 'cover', 'anh': 'cover', 'noi dung': 'start' };
  const found = {}; const used = new Set(); let start = -1; let startRest = '';
  items.forEach((el, idx) => {
    if (start >= 0) return;
    const m = /^([^:]{2,30}):\s*([\s\S]*)$/.exec(clean(el.textContent));
    if (!m) return;
    const key = LABEL[norm(m[1])];
    if (!key) return;
    used.add(idx);
    if (key === 'start') { start = idx; startRest = m[2].trim(); return; }
    found[key] = m[2].trim();
  });

  let bodyItems;
  if (start >= 0) bodyItems = items.slice(start + 1);
  else if (Object.keys(found).length) bodyItems = items.filter((_, idx) => !used.has(idx));
  else {
    found.title = items[0] ? clean(items[0].textContent) : '';
    let k = 1;
    const second = items[1];
    if (second && !second.querySelector('img') && clean(second.textContent).length <= 400) { found.sapo = clean(second.textContent); k = 2; }
    bodyItems = items.slice(k);
  }

  const holder = doc.createElement('div');
  if (startRest) { const p = doc.createElement('p'); p.textContent = startRest; holder.appendChild(p); }
  bodyItems.forEach((el) => holder.appendChild(el.cloneNode(true)));
  const text = clean(holder.textContent);
  if (!text) throw new Error('Tài liệu trống hoặc không đọc được nội dung.');

  const coverUrl = ((found.cover || '').match(/https?:\/\/\S+/) || [])[0] || '';
  const firstImg = holder.querySelector('img');
  const cover = coverUrl || (firstImg && firstImg.getAttribute('src')) || '';
  const title = clean(found.title) || clean(doc.title).replace(/\s*-\s*Google Docs$/i, '');
  return {
    url, title, sapo: clean(found.sapo || ''), html: sanitizeHtml(holder.innerHTML),
    author: clean(found.author || ''), site: '', cover: /^https?:\/\//i.test(cover) ? cover : '',
    category: clean(found.category || ''), length: text.length,
  };
};

window.DanBai = { parseArticle, fetchHtml, sanitizeHtml, docFromHtml };
