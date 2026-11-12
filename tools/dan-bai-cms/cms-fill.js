// Chạy trong trang CMS (ngữ cảnh của trang) để điền bài vào form soạn thảo.
// Viết cho CMS nền Directus (ngăn «Tạo bài viết», trình soạn thảo TinyMCE) nhưng vẫn dò theo nhãn nên dùng được với form khác.
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
  T.text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();

  // Nhãn của một ô: đoạn chữ ngắn đứng ngay trước ô đó (đi ngược lên tối đa 7 cấp).
  T.labelOf = (el) => {
    const doc = el.ownerDocument;
    if (el.id) { const l = doc.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l && T.text(l)) return T.text(l); }
    const wrap = el.closest('label'); if (wrap && T.text(wrap)) return T.text(wrap);
    let node = el;
    for (let depth = 0; depth < 7 && node && node !== doc.body; depth++, node = node.parentElement) {
      for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) {
        if (!T.visible(sib)) continue;
        if (sib.matches('input, textarea, select, iframe') || sib.querySelector('input, textarea, select, iframe, [contenteditable="true"]')) return '';
        const t = T.text(sib);
        if (t && t.length <= 80) return t.replace(/[\s*•·]+$/, '').replace(/^[\s*•·]+/, '');
        if (t) return '';
      }
    }
    return '';
  };

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
    body: /seo|meta|tom ?tat/,
    author: /anh|hinh|image/,
    date: /cap nhat|update|het han/,
    category: /phu|sub/,
    cover: /chu thich|hien thi|caption/,
  };

  T.score = (el, kind) => {
    const lab = T.norm(T.labelOf(el));
    if (lab && T.NOT[kind].test(lab)) return 0;
    let s = 0;
    if (lab) { const i = lab.search(T.PAT[kind]); s = i === 0 ? 4 : i > 0 ? 3 : 0; }
    const attrs = T.norm([el.getAttribute('name'), el.id, el.getAttribute('aria-label'), el.getAttribute('data-field')].filter(Boolean).join(' '));
    if (!s && T.PAT[kind].test(attrs) && !T.NOT[kind].test(attrs)) s = 2;
    const ph = T.norm(el.getAttribute('placeholder'));
    if (!s && !lab && T.PAT[kind].test(ph) && !/^(tim|loc|search|nhap tu khoa)/.test(ph)) s = 1;
    if (s && /english|tieng anh|\(en\)/.test(lab)) s = 0.5;
    return s;
  };

  T.findField = (kind, selector, allowReadonly) => {
    let best = null; let bestScore = 0;
    for (const el of document.querySelectorAll(selector || 'input[type=text], input:not([type]), textarea')) {
      if (el.disabled || (!allowReadonly && el.readOnly) || !T.visible(el)) continue;
      const s = T.score(el, kind);
      if (s > bestScore) { best = el; bestScore = s; }
    }
    return best;
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
    return [...list].filter((e) => e && e.getContainer && e.getContainer() && T.visible(e.getContainer()));
  };

  T.buttonOf = (el) => el && (el.closest('button, [role=button], a, .v-button') || el);
  return T;
}

// eslint-disable-next-line no-unused-vars
async function danBaiFill(data, map, opts) {
  const T = danBaiTools();
  const { sleep, waitFor, norm, visible, area, text, resolve, setValue } = T;
  opts = opts || {};
  map = map || {};
  // true = đã điền, false = thử nhưng không được, null = không làm.
  const out = { title: false, sapo: null, body: false, author: null, date: null, cover: null, category: null, submit: null, opened: false, notes: [] };
  const escapeHtml = (s) => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
  const pressEscape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));

  // ---- 0. Chưa mở form thì bấm nút «Tạo bài mới» (dấu +) ----
  const findTitle = () => resolve(map.title) || T.findField('title');
  let titleEl = findTitle();
  if (!titleEl) {
    const adds = [...document.querySelectorAll('[data-icon="add"], [data-icon="add_circle"]')]
      .map(T.buttonOf).filter((b) => visible(b) && !b.closest('.tox, table, tr'));
    const byText = [...document.querySelectorAll('button, a, [role=button]')]
      .filter((b) => visible(b) && /^(tao bai|them bai|viet bai|tao moi|them moi|create)/.test(norm(text(b) || b.getAttribute('aria-label') || b.title)));
    const add = adds.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] || byText[0];
    if (add) {
      add.click();
      out.opened = true;
      titleEl = await waitFor(findTitle, 8000);
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
    const el = resolve(map[kind]) || T.findField(kind);
    if (el && el !== titleEl) { setAny(el, value); out[kind] = true; } else out[kind] = false;
  }

  // ---- 2. Nội dung ----
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
    if (el.ckeditorInstance && el.ckeditorInstance.setData) { el.ckeditorInstance.setData(html); return; }
    const qc = el.classList.contains('ql-editor') && el.parentElement;
    const quill = qc && (qc.__quill || (window.Quill && Quill.find && Quill.find(qc)));
    if (quill && quill.clipboard) { quill.setText(''); quill.clipboard.dangerouslyPasteHTML(0, html); return; }
    el.focus();
    let ok = false;
    try {
      const sel = doc.getSelection(); const range = doc.createRange();
      range.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(range);
      ok = doc.execCommand('insertHTML', false, html);
    } catch (e) { ok = false; }
    if (!ok || !el.textContent.trim()) { el.innerHTML = html; el.dispatchEvent(new InputEvent('input', { bubbles: true })); }
  }
  function byLabel(list, elOf) {
    const scored = list.map((x) => ({ x, s: T.score(elOf(x), 'body'), a: area(elOf(x)) }));
    scored.sort((p, q) => q.s - p.s || q.a - p.a);
    return scored[0].x;
  }
  function fillBody(html) {
    const tiny = T.tinyEditors();
    const mapped = resolve(map.body);
    if (mapped) {
      const ed = tiny.find((e) => { try { return e.getDoc() === mapped.ownerDocument || e.getElement() === mapped || e.getContainer().contains(mapped); } catch (x) { return false; } });
      if (ed) { setTiny(ed, html); return true; }
      if (mapped.tagName === 'TEXTAREA' || mapped.tagName === 'INPUT') {
        const ck = window.CKEDITOR && CKEDITOR.instances && (CKEDITOR.instances[mapped.id] || CKEDITOR.instances[mapped.name]);
        if (ck) ck.setData(html); else setValue(mapped, html);
      } else setEditable(mapped.tagName === 'IFRAME' ? mapped.contentDocument.body : mapped, html);
      return true;
    }
    if (tiny.length) { setTiny(byLabel(tiny, (e) => e.getContainer()), html); return true; }
    if (window.CKEDITOR && CKEDITOR.instances && Object.keys(CKEDITOR.instances).length) {
      const list = Object.values(CKEDITOR.instances).filter((e) => e.container && e.container.$);
      if (list.length) { byLabel(list, (e) => e.container.$).setData(html); return true; }
    }
    const editables = [...document.querySelectorAll('.ck-editor__editable, .ql-editor, .note-editable, .fr-element, .ProseMirror, [contenteditable="true"], [contenteditable=""]')]
      .filter((el) => visible(el) && el !== titleEl && !el.parentElement.closest('[contenteditable="true"], [contenteditable=""]'));
    if (editables.length) { setEditable(byLabel(editables, (e) => e), html); return true; }
    const frames = [...document.querySelectorAll('iframe')].filter((f) => {
      try { const d = f.contentDocument; return d && d.body && visible(f) && (d.designMode === 'on' || d.body.isContentEditable); } catch (e) { return false; }
    });
    if (frames.length) { setEditable(byLabel(frames, (f) => f).contentDocument.body, html); return true; }
    const ta = T.findField('body', 'textarea');
    if (ta) { setValue(ta, html); return true; }
    return false;
  }
  try {
    // Trình soạn thảo có thể khởi tạo chậm hơn form một nhịp.
    if (!resolve(map.body)) await waitFor(() => T.tinyEditors().length || document.querySelector('[contenteditable="true"], .ck-editor__editable'), 3000);
    out.body = fillBody(data.html);
  } catch (e) { out.notes.push('Lỗi khi điền nội dung: ' + e.message); }

  // ---- 3. Ngày đăng = bây giờ ----
  async function setDateNow() {
    const el = resolve(map.date) || T.findField('date', 'input', true);
    if (!el) return false;
    if (el.value) return true;
    if (el.type === 'datetime-local' || el.type === 'date') {
      const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString();
      setValue(el, el.type === 'date' ? d.slice(0, 10) : d.slice(0, 16));
      return true;
    }
    el.click();
    const cal = await waitFor(() => [...document.querySelectorAll('.flatpickr-calendar')].find(visible), 3000);
    let ok = false;
    if (cal) {
      const hosts = [cal.parentElement, cal.previousElementSibling, ...document.querySelectorAll('.v-date-picker, .flatpickr-input')];
      const host = hosts.find((h) => h && h._flatpickr && h._flatpickr.calendarContainer === cal);
      if (host) { host._flatpickr.setDate(new Date(), true); ok = true; }
    }
    if (!ok) {
      const btn = [...document.querySelectorAll('button, a')].filter(visible)
        .find((b) => /to-now|set-now|today-btn/i.test(b.className) || /^(set to now|dat ve bay gio|dat thanh bay gio|bay gio|hien tai)/.test(norm(text(b))));
      if (btn) { btn.click(); ok = true; }
    }
    await sleep(300);
    pressEscape();
    await sleep(200);
    if (cal && visible(cal)) { el.click(); await sleep(200); }
    return ok || !!el.value;
  }
  if (opts.setDate) { try { out.date = await setDateNow(); } catch (e) { out.date = false; } }

  // ---- 4. Ảnh đại diện: dùng chức năng «nhập từ URL» của CMS ----
  async function importCover(url) {
    const links = [...document.querySelectorAll('[data-icon="link"], [data-icon="insert_link"]')]
      .filter((i) => !i.closest('.tox')).map(T.buttonOf).filter(visible);
    const btn = links.find((b) => { const l = norm(T.labelOf(b)); return T.PAT.cover.test(l) && !T.NOT.cover.test(l); });
    if (!btn) return null; // đã có ảnh, hoặc form không có nút nhập từ URL
    const before = new Set(document.querySelectorAll('input'));
    btn.click();
    const input = await waitFor(() => [...document.querySelectorAll('input')].find((i) => !before.has(i) && visible(i) && !i.readOnly && i.type !== 'file'), 4000);
    if (!input) return false;
    setValue(input, url, true);
    await sleep(300);
    const box = input.closest('.v-card, [role=dialog], .v-dialog, .dialog, .modal') || input.parentElement.parentElement.parentElement;
    const buttons = [...box.querySelectorAll('button')].filter(visible);
    const go = buttons.filter((b) => !b.disabled).pop();
    if (!go || buttons.length < 2 || go === buttons[0]) { if (buttons[0]) buttons[0].click(); return false; }
    go.click();
    const closed = await waitFor(() => !visible(input), 30000, 300);
    if (!closed) { buttons[0].click(); return false; }
    await sleep(400);
    return !visible(btn);
  }
  if (opts.importCover && data.cover) { try { out.cover = await importCover(data.cover); } catch (e) { out.cover = false; } }

  // ---- 5. Danh mục ----
  async function setCategory(name) {
    const want = norm(name);
    const el = resolve(map.category) || T.findField('category', 'input', true) ||
      [...document.querySelectorAll('.v-select, [role=combobox], select')].filter(visible).find((x) => T.score(x, 'category') >= 3);
    if (!el) return false;
    if (el.tagName === 'SELECT') {
      const opt = [...el.options].find((o) => norm(o.textContent) === want);
      if (!opt) return false;
      el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    if (norm(el.value || '') === want) return true;
    el.click();
    const sel = '.v-list-item, [role=option], [role=menuitem], li, tr, .table-row';
    const pick = await waitFor(() => [...document.querySelectorAll(sel)].filter(visible).find((x) => {
      const t = norm(text(x));
      return t === want || [...x.children].some((c) => norm(text(c)) === want);
    }), 5000);
    if (!pick) { pressEscape(); return false; }
    pick.click();
    await sleep(300);
    return true;
  }
  if (data.category) { try { out.category = await setCategory(data.category); } catch (e) { out.category = false; } }

  // ---- 6. Bấm nút lưu / gửi duyệt (chỉ khi mọi bước đều thành công) ----
  if (opts.autoSubmit) {
    const btn = resolve(map.submit);
    const failed = ['title', 'sapo', 'body', 'author', 'date', 'cover', 'category'].some((k) => out[k] === false);
    if (!btn) out.submit = false;
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
  lines.push('--- Ô nhập ---');
  for (const el of document.querySelectorAll('input, textarea, select, iframe, [contenteditable="true"]')) {
    if (!T.visible(el) || el.closest('.tox')) continue;
    lines.push([el.tagName.toLowerCase() + (el.type ? '[' + el.type + ']' : ''), el.readOnly ? 'readonly' : '', 'nhãn: ' + T.labelOf(el),
      'ph: ' + (el.getAttribute('placeholder') || ''), chain(el)].filter(Boolean).join(' | '));
  }
  lines.push('--- Nút có biểu tượng ---');
  const icons = new Map();
  for (const i of document.querySelectorAll('[data-icon]')) {
    if (!T.visible(i) || i.closest('.tox')) continue;
    const b = T.buttonOf(i); const key = i.getAttribute('data-icon');
    if (b !== i && !icons.has(key)) icons.set(key, chain(b) + ' | nhãn: ' + T.labelOf(b));
  }
  icons.forEach((v, k) => lines.push(k + ' | ' + v));
  lines.push('flatpickr: ' + document.querySelectorAll('.flatpickr-calendar').length);
  return lines.join('\n').slice(0, 12000);
}
