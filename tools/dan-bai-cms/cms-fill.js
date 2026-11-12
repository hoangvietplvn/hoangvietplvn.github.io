// Chạy trong trang CMS để điền bài vào form «Tạo bài viết» (Directus + TinyMCE).
// Ô được tìm theo tên trên form (ví dụ «Tiêu đề (Tiếng Việt)»), không theo vị trí trong trang.
// Mỗi hàm phải tự chứa toàn bộ vì được tiêm qua chrome.scripting.executeScript.

// eslint-disable-next-line no-unused-vars
function danBaiTools() {
  const T = {};
  T.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  T.waitFor = async (fn, ms = 6000, step = 150) => {
    const t0 = Date.now();
    for (;;) {
      let v = null;
      try { v = fn(); } catch (e) { v = null; }
      if (v) return v;
      if (Date.now() - t0 > ms) return null;
      await T.sleep(step);
    }
  };
  T.norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
  T.visible = (el) => { if (!el || !el.isConnected) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  T.area = (el) => { const r = el.getBoundingClientRect(); return r.width * r.height; };
  T.text = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
  T.clean = (t) => (t || '').replace(/\s+/g, ' ').replace(/[\s*•·]+$/, '').replace(/^[\s*•·]+/, '').trim();

  // Tên ô trên form Directus: nút .field-name (hoặc .field-label nếu không có).
  T.fieldLabel = (f) => { const fn = f.querySelector('.field-name') || f.querySelector('.field-label'); return fn ? T.clean(T.text(fn)) : ''; };

  T.PAT = {
    title: /tieu ?de|title|headline|ten bai/,
    sapo: /sapo|tom ?tat|mo ?ta|summary|excerpt|description|trich dan|gioi thieu|\blead\b/,
    body: /noi ?dung|content|body|chi ?tiet/,
    author: /tac ?gia|but ?danh|author|nguoi viet/,
    date: /ngay ?dang|ngay xuat ban|thoi gian dang|publish/,
    category: /danh ?muc|chuyen ?muc|category/,
    cover: /hinh anh dai dien|anh dai dien|hinh dai dien|anh bia|avatar|thumbnail|featured/,
  };
  T.NOT = {
    title: /seo|meta|phu|sub|slug|anh|hinh|image|file|tap tin/,
    sapo: /seo|meta|anh|hinh|image|file/,
    body: /seo|meta|tom ?tat|hien thi|hinh|anh|image/,
    author: /anh|hinh|image/,
    date: /cap nhat|update|het han/,
    category: /phu|sub/,
    cover: /chu thich|hien thi|caption/,
  };

  // Tìm khối .field đang hiển thị. Ưu tiên tên đã ghi nhớ khi chỉ định; không có thì dò theo từ khóa.
  T.fieldFor = (kind, m) => {
    const fields = [...document.querySelectorAll('.field')].filter((f) => T.visible(f) && f.querySelector('.field-name, .field-label'));
    if (m && m.label) {
      const want = T.norm(m.label);
      const hit = fields.find((f) => T.norm(T.fieldLabel(f)) === want) || fields.find((f) => T.norm(T.fieldLabel(f)).startsWith(want));
      if (hit) return hit;
    }
    let best = null; let bestScore = 0;
    for (const f of fields) {
      const lab = T.norm(T.fieldLabel(f));
      if (!lab || T.NOT[kind].test(lab)) continue;
      const i = lab.search(T.PAT[kind]);
      const sc = i === 0 ? 4 : i > 0 ? 3 : 0;
      if (sc > bestScore) { best = f; bestScore = sc; }
    }
    return best;
  };

  // Phần tử nhập liệu bên trong khối .field.
  T.controlIn = (f, kind) => {
    if (kind === 'cover') return f.querySelector('input[type=file]');
    if (kind === 'body') return f.querySelector('textarea, iframe, [contenteditable="true"]');
    if (kind === 'date' || kind === 'category') return f.querySelector('.interface') || f;
    return f.querySelector('input:not([type=file]):not([type=hidden]), textarea, [contenteditable="true"]');
  };

  T.resolveField = (kind, m) => {
    const f = T.fieldFor(kind, m);
    if (f) return T.controlIn(f, kind);
    // Dự phòng cho bộ chọn cũ (không có tên): chỉ nhận ô đang hiển thị.
    if (m && m.selector && !m.label) { const el = T.resolve(m); if (el && T.visible(el)) return el; }
    return null;
  };

  // Nhãn của một ô không nằm trong .field (dùng cho ô ngoài form Directus).
  T.labelOf = (el) => {
    const doc = el.ownerDocument;
    const f = el.closest('.field');
    if (f && T.fieldLabel(f)) return T.fieldLabel(f);
    if (el.id) { const l = doc.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l && T.text(l)) return T.text(l); }
    const wrap = el.closest('label'); if (wrap && T.text(wrap)) return T.text(wrap);
    return '';
  };

  T.resolve = (m) => {
    if (!m || !m.selector) return null;
    let doc = document;
    if (m.frame) {
      const f = document.querySelector(m.frame);
      try { doc = f && f.contentDocument; } catch (e) { doc = null; }
      if (!doc) return null;
    }
    try { return doc.querySelector(m.selector); } catch (e) { return null; }
  };

  T.setValue = (el, value, keepFocus) => {
    const win = el.ownerDocument.defaultView;
    const proto = el instanceof win.HTMLTextAreaElement ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value');
    el.focus();
    if (setter && setter.set) setter.set.call(el, value); else el.value = value;
    for (const type of ['input', 'change']) el.dispatchEvent(new Event(type, { bubbles: true }));
    if (!keepFocus) el.blur();
  };

  T.tinyEditors = () => {
    const t = window.tinymce;
    if (!t) return [];
    let list = [];
    try { list = (t.get && t.get()) || []; } catch (e) { list = []; }
    if (!Array.isArray(list) || !list.length) list = t.editors || [];
    return [...list].filter((e) => { try { return e && e.initialized !== false && e.getContainer && e.getContainer() && T.visible(e.getContainer()); } catch (x) { return false; } });
  };

  T.buttonOf = (el) => el && (el.closest('button, [role=button], a, .v-button') || el);
  return T;
}

// eslint-disable-next-line no-unused-vars
async function danBaiFill(data, map, opts) {
  const T = danBaiTools();
  const { sleep, waitFor, norm, visible, area, text, setValue } = T;
  opts = opts || {};
  map = map || {};
  // true = đã điền, false = thử nhưng không được, null = không làm.
  const out = { title: false, sapo: null, body: false, author: null, date: null, cover: null, category: null, submit: null, opened: false, notes: [] };
  const escapeHtml = (s) => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
  const pressEscape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  const clickOutside = () => {
    const spot = document.querySelector('.drawer h2, .drawer h1, h2, h1') || document.body;
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) spot.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  };
  const findBy = (re) => [...document.querySelectorAll('a, button, span, div')]
    .filter((e) => visible(e) && re.test(norm(text(e))) && e.children.length <= 2)
    .sort((a, b) => area(a) - area(b))[0] || null;

  // ---- 0. Chưa mở form thì bấm nút + (Tạo bài viết) ----
  let titleEl = T.resolveField('title', map.title);
  if (!titleEl) {
    const adds = [...document.querySelectorAll('[data-icon="add"], [data-icon="add_circle"]')]
      .map(T.buttonOf).filter((b) => visible(b) && !b.closest('.tox, table, tr'));
    const byText = [...document.querySelectorAll('button, a, [role=button]')]
      .filter((b) => visible(b) && /^(tao bai|them bai|viet bai|tao moi|them moi|create)/.test(norm(text(b) || b.getAttribute('aria-label') || b.title)));
    const add = adds.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] || byText[0];
    if (add) {
      add.click();
      out.opened = true;
      titleEl = await waitFor(() => T.resolveField('title', map.title), 8000);
      if (titleEl) await sleep(600);
    }
  }
  if (!titleEl) {
    out.notes.push('Không thấy form «Tạo bài viết». Hãy bấm nút + (Tạo bài mới) trên CMS rồi bấm lại.');
    return out;
  }

  // ---- 1. Tiêu đề, tóm tắt, tác giả ----
  function setAny(el, value) {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') { setValue(el, value); return; }
    el.focus();
    el.innerHTML = escapeHtml(value);
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }
  setAny(titleEl, data.title); out.title = true;
  for (const [kind, value] of [['sapo', data.sapo], ['author', data.author]]) {
    if (!value) continue;
    const el = T.resolveField(kind, map[kind]);
    if (el && el !== titleEl) { setAny(el, value); out[kind] = true; } else out[kind] = false;
  }

  // ---- 2. Nội dung (TinyMCE) ----
  function setTiny(ed, html) {
    try { ed.focus(); } catch (e) { /* bỏ qua */ }
    ed.setContent('');
    try { ed.execCommand('mceInsertContent', false, html); } catch (e) { ed.setContent(html); }
    if (!ed.getContent()) ed.setContent(html);
    try { if (ed.setDirty) ed.setDirty(true); } catch (e) { /* bỏ qua */ }
    const fire = ed.dispatch || ed.fire;
    for (const ev of ['input', 'change']) { try { fire.call(ed, ev); } catch (e) { /* bỏ qua */ } }
    try { if (ed.save) ed.save(); } catch (e) { /* bỏ qua */ }
  }
  function setEditable(el, html) {
    const doc = el.ownerDocument;
    el.focus();
    let ok = false;
    try {
      const sel = doc.getSelection(); const range = doc.createRange();
      range.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(range);
      ok = doc.execCommand('insertHTML', false, html);
    } catch (e) { ok = false; }
    if (!ok || !el.textContent.trim()) { el.innerHTML = html; el.dispatchEvent(new InputEvent('input', { bubbles: true })); }
  }
  async function fillBody(html) {
    const f = T.fieldFor('body', map.body);
    if (f) {
      await waitFor(() => T.tinyEditors().length || f.querySelector('[contenteditable="true"]'), 6000, 200);
      const inF = (e) => { try { return f.contains(e.getContainer()) || f.contains(e.getElement()); } catch (x) { return false; } };
      const ed = T.tinyEditors().find(inF);
      if (ed) { setTiny(ed, html); return true; }
      const ce = f.querySelector('[contenteditable="true"], [contenteditable=""]');
      if (ce) { setEditable(ce, html); return true; }
      const ta = f.querySelector('textarea');
      if (ta) { setValue(ta, html); return true; }
      return false;
    }
    const tiny = T.tinyEditors();
    if (tiny.length) { setTiny(tiny[0], html); return true; }
    return false;
  }
  try { out.body = await fillBody(data.html); } catch (e) { out.notes.push('Lỗi khi điền nội dung: ' + e.message); }

  // ---- 3. Ngày đăng = bây giờ (nút «Set to Now» trong lịch) ----
  async function setDateNow() {
    const f = T.fieldFor('date', map.date);
    if (!f) return false;
    const has = () => { const inp = f.querySelector('input'); return (!!inp && !!inp.value) || /\d{1,2}\/\d{1,2}\/\d{4}/.test(text(f)); };
    if (has()) return true;
    const native = f.querySelector('input[type=datetime-local], input[type=date]');
    if (native) {
      const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString();
      setValue(native, native.type === 'date' ? d.slice(0, 10) : d.slice(0, 16));
      return true;
    }
    T.controlIn(f, 'date').click();
    const now = await waitFor(() => findBy(/^(set to now|dat ve bay gio|bay gio)$/), 3000);
    if (now) now.click();
    await sleep(300);
    pressEscape();
    await sleep(200);
    if (!has()) { clickOutside(); await sleep(200); }
    return has();
  }
  if (opts.setDate) { try { out.date = await setDateNow(); } catch (e) { out.date = false; } }

  // ---- 4. Ảnh đại diện: tải ảnh bài gốc (đã đọc sẵn trong data.coverFile) rồi đẩy vào ô tải tệp ----
  async function setCover(d) {
    const f = T.fieldFor('cover', map.cover);
    if (!f) return false;
    if (f.querySelector('img')) return true;
    const input = T.controlIn(f, 'cover');
    if (!input) return false;
    const bin = atob(d.b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const file = new File([u8], d.name, { type: d.mime || 'image/jpeg' });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return !!(await waitFor(() => f.querySelector('img'), 20000, 300));
  }
  if (opts.importCover) {
    if (data.coverFile) { try { out.cover = await setCover(data.coverFile); } catch (e) { out.cover = false; } }
    else out.cover = null;
  }

  // ---- 5. Danh mục: mở hộp «Chọn Bản Ghi», chọn dòng có tên trùng, bấm dấu tích ----
  const findModal = () => [...document.querySelectorAll('div, section, article, aside, [role=dialog]')]
    .filter((e) => visible(e) && /chon ban ghi/.test(norm(text(e).slice(0, 200))) && e.querySelector('tr, .v-list-item, [role=option]'))
    .sort((a, b) => area(a) - area(b))[0] || null;
  const findRow = (modal, want) => [...modal.querySelectorAll('tr, [role=row], .v-list-item, li, [role=option]')]
    .filter((r) => visible(r) && [...r.querySelectorAll('td, span, div, li')].some((c) => norm(text(c)) === want))
    .sort((a, b) => text(a).length - text(b).length)[0] || null;
  async function setCategory(name) {
    const f = T.fieldFor('category', map.category);
    if (!f) return false;
    const want = norm(name);
    const ifc = f.querySelector('.interface') || f;
    if (norm(text(ifc)).includes(want)) return true;
    ifc.click();
    const modal = await waitFor(findModal, 5000);
    if (!modal) return false;
    const row = await waitFor(() => findRow(modal, want), 3000);
    if (!row) { pressEscape(); return false; }
    row.click();
    const radio = row.querySelector('input[type=radio], input[type=checkbox]');
    if (radio && !radio.checked) radio.click();
    await sleep(250);
    const ok = [...modal.querySelectorAll('[data-icon="check"]')].map(T.buttonOf).filter(visible).pop();
    if (ok) ok.click(); else pressEscape();
    await waitFor(() => !visible(modal), 4000, 200);
    await sleep(300);
    return norm(text(ifc)).includes(want);
  }
  if (data.category) { try { out.category = await setCategory(data.category); } catch (e) { out.category = false; } }

  // ---- 6. Bấm nút lưu (chỉ khi mọi ô đều điền được) ----
  if (opts.autoSubmit) {
    const btn = T.resolve(map.submit);
    const failed = ['title', 'sapo', 'body', 'author', 'date', 'cover', 'category'].some((k) => out[k] === false);
    if (!btn || !visible(btn)) out.submit = false;
    else if (failed) { out.submit = false; out.notes.push('Còn ô chưa điền được nên không tự bấm nút lưu.'); }
    else { setTimeout(() => btn.click(), 800); out.submit = true; }
  }
  return out;
}

// Bản mô tả cấu trúc form (không kèm nội dung đã nhập) để gửi cho người phát triển khi tiện ích điền sai.
// eslint-disable-next-line no-unused-vars
function danBaiDiag() {
  const T = danBaiTools();
  const cls = (el) => (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).slice(0, 4).join('.');
  const chain = (el) => { const p = []; for (let n = el, i = 0; n && n !== document.body && i < 4; n = n.parentElement, i++) p.push(n.tagName.toLowerCase() + (cls(n) ? '.' + cls(n) : '')); return p.join(' < '); };
  const lines = ['URL: ' + location.origin + location.pathname];
  const t = window.tinymce;
  lines.push('tinymce: ' + (t ? (t.majorVersion + '.' + t.minorVersion) : 'không có') + ', CKEDITOR: ' + (window.CKEDITOR ? 'có' : 'không'));
  T.tinyEditors().forEach((e) => lines.push('  editor ' + e.id + ' | nhãn: ' + T.labelOf(e.getContainer())));
  lines.push('--- Các khối .field ---');
  for (const f of document.querySelectorAll('.field')) {
    if (!T.visible(f)) continue;
    const itf = f.querySelector('.interface');
    const kids = itf ? [...itf.querySelectorAll('input, textarea, button, iframe, .v-list-item')].slice(0, 5).map((k) => k.tagName.toLowerCase() + (k.type ? '[' + k.type + ']' : '') + (cls(k) ? '.' + cls(k) : '')).join(', ') : '';
    lines.push(T.fieldLabel(f) + ' | ' + cls(f) + ' | ' + kids);
  }
  lines.push('--- Ô nhập ngoài form ---');
  for (const el of document.querySelectorAll('input, textarea, select, iframe')) {
    if (!T.visible(el) || el.closest('.tox, .field')) continue;
    lines.push([el.tagName.toLowerCase() + (el.type ? '[' + el.type + ']' : ''), el.readOnly ? 'readonly' : '', 'ph: ' + (el.getAttribute('placeholder') || ''), chain(el)].filter(Boolean).join(' | '));
  }
  lines.push('--- Nút có biểu tượng ---');
  const icons = new Map();
  for (const i of document.querySelectorAll('[data-icon]')) {
    if (!T.visible(i) || i.closest('.tox')) continue;
    const b = T.buttonOf(i); const key = i.getAttribute('data-icon');
    if (b !== i && !icons.has(key)) icons.set(key, chain(b));
  }
  icons.forEach((v, k) => lines.push(k + ' | ' + v));
  return lines.join('\n').slice(0, 12000);
}
