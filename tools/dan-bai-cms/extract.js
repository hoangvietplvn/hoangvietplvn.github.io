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

window.DanBai = { parseArticle, fetchHtml, sanitizeHtml };
