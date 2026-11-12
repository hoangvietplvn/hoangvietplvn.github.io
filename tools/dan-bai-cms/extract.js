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

  // Chữ đậm / nghiêng (Google Docs đặt trong lớp CSS gắn vào span).
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

  // Google Docs đôi khi bọc nội dung trong một khối div.
  let root = doc.body;
  if (root.children.length === 1 && root.children[0].tagName === 'DIV' && root.children[0].children.length > 1) root = root.children[0];

  // Link Drive đứng riêng trong đoạn (tên/đường dẫn là toàn bộ đoạn) → ảnh cần tải từ Drive.
  const driveId = (href) => {
    let h = href || '';
    const q = /[?&]q=([^&]+)/.exec(h);
    if (q) { try { h = decodeURIComponent(q[1]); } catch (e) { /* giữ nguyên */ } }
    const m = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]+)/.exec(h);
    return m ? m[1] : '';
  };
  [...root.querySelectorAll('a[href]')].forEach((a) => {
    const id = driveId(a.getAttribute('href'));
    if (!id) return;
    const p = a.parentElement;
    if (!p || (clean(p.textContent) && clean(p.textContent) !== clean(a.textContent))) return;
    const img = doc.createElement('img');
    img.setAttribute('src', 'https://drive.google.com/uc?export=download&id=' + id);
    a.replaceWith(img);
  });

  // Nhãn đầu tài liệu (không bắt buộc): Tiêu đề, Sapo/Tóm tắt, Tác giả, Danh mục, Ảnh đại diện, Nội dung.
  const labelKey = (raw) => {
    const n = norm(raw);
    if (/^tieu de/.test(n)) return 'title';
    if (/^(sapo|tom tat)/.test(n)) return 'sapo';
    if (/^tac gia/.test(n)) return 'author';
    if (/^(danh muc|chuyen muc)/.test(n)) return 'category';
    if (/^(anh dai dien|anh bia)/.test(n)) return 'cover';
    if (n === 'noi dung') return 'start';
    return '';
  };
  const items = [...root.children].filter((el) => clean(el.textContent) || el.querySelector('img'));
  const found = {}; const used = new Set(); let start = -1; let startRest = '';
  items.forEach((el, idx) => {
    if (start >= 0) return;
    const m = /^([^:]{2,40}):\s*([\s\S]*)$/.exec(clean(el.textContent));
    if (!m) return;
    const key = labelKey(m[1]);
    if (!key) return;
    used.add(idx);
    if (key === 'start') { start = idx; startRest = m[2].trim(); return; }
    if (!found[key]) found[key] = m[2].trim();
  });

  let bodyItems;
  if (start >= 0) bodyItems = items.slice(start + 1);
  else if (Object.keys(found).length) bodyItems = items.filter((_, i) => !used.has(i));
  else bodyItems = items.slice();
  const pool = items.filter((_, i) => !used.has(i));

  // Tiêu đề: nhãn → heading hoặc dòng ngắn trong 3 đoạn đầu → tên tài liệu.
  let titleEl = null; let titleFrom = '';
  if (found.title) titleFrom = 'nhãn «Tiêu đề» trong tài liệu';
  else {
    const head = pool.slice(0, 3);
    const cand = head.find((el) => /^H[1-3]$/.test(el.tagName) && clean(el.textContent))
      || head.find((el) => /(^|\s)title(\s|$)/.test(el.className || '') && clean(el.textContent))
      || head.find((el) => clean(el.textContent) && !el.querySelector('img'));
    if (cand && clean(cand.textContent).length <= 250) {
      titleEl = cand; found.title = clean(cand.textContent);
      titleFrom = /^H/.test(cand.tagName) ? 'tiêu đề (heading) đầu tài liệu' : 'dòng đầu tài liệu';
    }
  }
  if (!found.title) {
    const dn = clean(doc.title).replace(/\s*-\s*Google Docs$/i, '');
    if (dn) { found.title = dn; titleFrom = 'tên tài liệu'; }
  }
  if (titleEl) bodyItems = bodyItems.filter((el) => el !== titleEl);

  // Sapo: nhãn, hoặc đoạn ngắn ngay sau tiêu đề.
  let sapo = found.sapo || ''; let sapoEl = null;
  if (!sapo && titleEl) {
    // Bỏ qua ảnh nằm giữa tiêu đề và sapo (ảnh đại diện); sapo là đoạn chữ ngắn đầu tiên sau đó.
    const ti = pool.indexOf(titleEl);
    const next = pool.slice(ti + 1, ti + 5).find((el) => clean(el.textContent) && !/^H[1-6]$/.test(el.tagName));
    if (next && clean(next.textContent).length <= 400) {
      sapo = clean(next.textContent); sapoEl = next;
      bodyItems = bodyItems.filter((el) => el !== sapoEl);
    }
  }

  // Ảnh đại diện khi không có dòng «Ảnh đại diện:»: ảnh đầu tiên nằm sau tiêu đề/sapo; không có thì ảnh đầu tiên của tài liệu.
  const coverUrl = ((found.cover || '').match(/https?:\/\/\S+/) || [])[0] || '';
  if (!coverUrl) {
    // Ảnh đầu tiên sau tiêu đề (thường nằm ngay dưới tiêu đề, trước sapo).
    const titleIdx = titleEl ? items.indexOf(titleEl) : -1;
    const imgOf = (el) => (el.tagName === 'IMG' ? el : el.querySelector('img'));
    const after = items.slice(titleIdx + 1).map(imgOf).find((x) => x && /^https?:\/\//i.test(x.getAttribute('src') || ''));
    const any = items.map(imgOf).find((x) => x && /^https?:\/\//i.test(x.getAttribute('src') || ''));
    const chosen = after || any;
    if (chosen) chosen.setAttribute('data-dbcover', '1');
  }

  const holder = doc.createElement('div');
  if (startRest) { const p = doc.createElement('p'); p.textContent = startRest; holder.appendChild(p); }
  bodyItems.forEach((el) => holder.appendChild(el.cloneNode(true)));
  const text = clean(holder.textContent);
  if (!text) throw new Error('Tài liệu trống hoặc không đọc được nội dung.');

  let cover = coverUrl;
  const coverImg = holder.querySelector('img[data-dbcover]');
  if (!cover && coverImg) { cover = coverImg.getAttribute('src') || ''; coverImg.remove(); }

  const images = [...new Set([...holder.querySelectorAll('img')].map((i) => i.getAttribute('src') || '').filter((s) => /^https?:\/\//i.test(s)))];
  return {
    url, title: clean(found.title), sapo: clean(sapo), html: sanitizeHtml(holder.innerHTML),
    author: clean(found.author || ''), site: '', cover, category: clean(found.category || ''),
    length: text.length, images, fromDoc: true,
    notes: ['Tiêu đề lấy từ: ' + (titleFrom || 'không tìm thấy, hãy nhập tay') + '.'],
  };
}

window.DanBai = { parseArticle, fetchHtml, sanitizeHtml, docFromHtml };
