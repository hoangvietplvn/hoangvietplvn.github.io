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
  T.text = (el) => ((el && el.textContent) || '').replace(/\s+/g, ' ').trim();
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

  // Phần tử nhập liệu bên trong khối .field (ô input, textarea, file...).
  T.controlIn = (f, kind) => {
    if (kind === 'cover') return f.querySelector('input[type=file]');
    if (kind === 'body') return f.querySelector('textarea, iframe, [contenteditable="true"]');
    return f.querySelector('input:not([type=file]):not([type=hidden]), textarea, [contenteditable="true"]');
  };

  // Nút thật để mở lịch / hộp chọn: Directus đặt trong button.v-list-item bên trong .interface.
  // Bấm vào vùng bao ngoài (.interface) sẽ không mở gì.
  T.clickIn = (f) => {
    const pool = [...f.querySelectorAll('button, [role=button], .v-input, input, .interface')]
      .filter((x) => !x.closest('.field-label') && T.visible(x));
    const el = pool.find((x) => x.matches('button.v-list-item')) || pool.find((x) => x.matches('button')) || pool[0] || f;
    el.scrollIntoView({ block: 'center' });
    const win = el.ownerDocument.defaultView;
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      const Ev = type.startsWith('pointer') ? win.PointerEvent : win.MouseEvent;
      el.dispatchEvent(new Ev(type, { bubbles: true, cancelable: true, view: win }));
    }
    el.click();
    return el;
  };

  // Gõ chữ vào ô như người dùng (chọn hết rồi chèn) để CMS ghi nhận giá trị; không được thì gán trực tiếp.
  T.setText = (el, value) => {
    const doc = el.ownerDocument;
    el.focus();
    try { el.select(); } catch (e) { /* ô không hỗ trợ chọn */ }
    try { doc.execCommand('insertText', false, value); } catch (e) { /* bỏ qua */ }
    if ((el.value || '').trim() !== value.trim()) T.setValue(el, value, true);
    return (el.value || '').trim() === value.trim();
  };

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
  const { sleep, waitFor, norm, visible, area, text } = T;
  opts = opts || {};
  map = map || {};
  // true = đã điền và kiểm tra lại được, false = thử nhưng không được, null = không làm.
  const out = { title: null, sapo: null, body: null, author: null, date: null, cover: null, category: null, submit: null, opened: false, notes: [] };
  const fieldEl = (kind) => T.fieldFor(kind, map[kind]);
  const findBy = (re) => [...document.querySelectorAll('a, button, span, div')]
    .filter((e) => visible(e) && re.test(norm(text(e))) && e.children.length <= 2)
    .sort((a, b) => area(a) - area(b))[0] || null;
  const clickOutside = () => {
    const spot = document.querySelector('.drawer h2, .drawer h1, h2, h1') || document.body;
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) spot.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  };
  const setTextKind = (kind, value) => {
    const f = fieldEl(kind);
    if (!f) return null;
    const el = T.controlIn(f, kind);
    if (!el) return false;
    return T.setText(el, value);
  };

  // ---- 0. Mở form «Tạo bài viết» nếu chưa mở ----
  let tf = fieldEl('title');
  if (!tf) {
    const adds = [...document.querySelectorAll('[data-icon="add"], [data-icon="add_circle"]')]
      .map(T.buttonOf).filter((b) => visible(b) && !b.closest('.tox, table, tr'));
    const byText = [...document.querySelectorAll('button, a, [role=button]')]
      .filter((b) => visible(b) && /^(tao bai|them bai|viet bai|tao moi|them moi|create)/.test(norm(text(b) || b.getAttribute('aria-label') || b.title)));
    const add = adds.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] || byText[0];
    if (add) { add.click(); out.opened = true; }
    tf = await waitFor(() => fieldEl('title'), 8000);
    // Form tải dữ liệu nền sau khi mở; chờ cho ổn định rồi mới điền.
    if (tf) await sleep(1200);
  }
  if (!tf) {
    out.notes.push('Không thấy form «Tạo bài viết». Hãy bấm nút + (Tạo bài mới) trên CMS rồi bấm lại.');
    return out;
  }

  // ---- 1. Nội dung (TinyMCE) ----
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
    const f = fieldEl('body');
    if (f) {
      await waitFor(() => T.tinyEditors().length || f.querySelector('[contenteditable="true"]'), 6000, 200);
      const inF = (e) => { try { return f.contains(e.getContainer()) || f.contains(e.getElement()); } catch (x) { return false; } };
      const ed = T.tinyEditors().find(inF);
      if (ed) { setTiny(ed, html); return true; }
      const ce = f.querySelector('[contenteditable="true"], [contenteditable=""]');
      if (ce) { setEditable(ce, html); return true; }
      const ta = f.querySelector('textarea');
      if (ta) { T.setValue(ta, html); return true; }
      return false;
    }
    const tiny = T.tinyEditors();
    if (tiny.length) { setTiny(tiny[0], html); return true; }
    return false;
  }

  // ---- 2. Tác giả ----
  // Tác giả luôn được ghi theo bài; trống thì xóa giá trị mặc định có sẵn của CMS.
  try { out.author = setTextKind('author', data.author || ''); } catch (e) { out.author = false; }

  // ---- 3. Ngày đăng = bây giờ: bấm ô ngày để mở lịch, rồi bấm «Set to Now» ----
  async function setDateNow() {
    const f = fieldEl('date');
    if (!f) return false;
    const DATE_RE = /\d{1,2}\/\d{1,2}\/\d{4}/;
    const has = () => DATE_RE.test(text(f)) || [...f.querySelectorAll('input')].some((i) => DATE_RE.test(i.value || ''));
    if (has()) return true;
    T.clickIn(f);
    const now = await waitFor(() => findBy(/^(set to now|dat ve bay gio|bay gio)$/), 4000);
    if (!now) { out.notes.push('Ngày đăng: bấm ô ngày nhưng không thấy lịch có nút «Set to Now».'); return false; }
    now.click();
    await sleep(500);
    clickOutside();
    await sleep(400);
    if (!has()) out.notes.push('Ngày đăng: đã bấm «Set to Now» nhưng ô vẫn trống.');
    return has();
  }
  if (opts.setDate) { try { out.date = await setDateNow(); } catch (e) { out.date = false; } }

  // ---- 4. Ảnh đại diện: đẩy ảnh đã tải của bài gốc vào ô tải tệp ----
  async function setCover(d) {
    const f = fieldEl('cover');
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

  // ---- 5. Danh mục: bấm ô danh mục, chọn dòng trong hộp «Chọn Bản Ghi», bấm dấu tích ----
  const findModal = () => [...document.querySelectorAll('div, section, article, aside, [role=dialog]')]
    .filter((e) => visible(e) && /chon ban ghi/.test(norm(text(e).slice(0, 200))) && e.querySelector('tr, .v-list-item, [role=option]'))
    .sort((a, b) => area(a) - area(b))[0] || null;
  const findRow = (modal, want) => [...modal.querySelectorAll('tr, [role=row], .v-list-item, li, [role=option]')]
    .filter((r) => visible(r) && [...r.querySelectorAll('td, span, div, li')].some((c) => norm(text(c)) === want))
    .sort((a, b) => text(a).length - text(b).length)[0] || null;
  async function setCategory(name) {
    const f = fieldEl('category');
    if (!f) return false;
    const want = norm(name);
    const itf = f.querySelector('.interface') || f;
    if (norm(text(itf)).includes(want)) return true;
    T.clickIn(f);
    const modal = await waitFor(findModal, 5000);
    if (!modal) { out.notes.push('Danh mục: bấm ô danh mục nhưng không thấy hộp «Chọn Bản Ghi».'); return false; }
    const row = await waitFor(() => findRow(modal, want), 3000);
    if (!row) { out.notes.push('Danh mục: không thấy dòng «' + name + '» trong hộp.'); return false; }
    const okBtn = () => [...modal.querySelectorAll('[data-icon="check"]')].map(T.buttonOf).filter(visible).pop() || null;
    const isOff = (b) => { if (!b) return true; const cs = getComputedStyle(b); return b.disabled || b.getAttribute('aria-disabled') === 'true' || cs.opacity < 1 || cs.pointerEvents === 'none'; };
    // Chọn dòng: bấm ô tròn ở cột đầu. Dấu tích ở đầu hộp chỉ bật sau khi đã chọn.
    const circle = row.querySelector('input[type=radio], [role=radio], .radio, .v-radio, [role=checkbox]') || row.querySelector('td:first-child > *') || row.querySelector('td:first-child') || row;
    circle.click();
    await sleep(300);
    if (isOff(okBtn())) { row.click(); await sleep(300); }
    if (isOff(okBtn())) { out.notes.push('Danh mục: đã chọn dòng nhưng dấu tích vẫn chưa bật.'); return false; }
    okBtn().click();
    const closed = await waitFor(() => !visible(modal), 4000, 200);
    if (!closed) { out.notes.push('Danh mục: đã bấm dấu tích nhưng hộp chưa đóng.'); return false; }
    await sleep(400);
    return norm(text(itf)).includes(want);
  }
  if (data.category) { try { out.category = await setCategory(data.category); } catch (e) { out.category = false; } }

  // ---- 6. Tiêu đề, tóm tắt: điền sau cùng, rồi kiểm tra lại (form có thể xóa khi tải xong) ----
  for (let pass = 0; pass < 2; pass++) {
    for (const [kind, value] of [['title', data.title], ['sapo', data.sapo]]) {
      if (!value) continue;
      const f = fieldEl(kind);
      const el = f && T.controlIn(f, kind);
      if (!el) { out[kind] = false; continue; }
      if ((el.value || '').trim() === value.trim()) { out[kind] = true; continue; }
      out[kind] = T.setText(el, value);
    }
    await sleep(700);
  }
  if (!out.title) out.notes.push('Tiêu đề: không điền và kiểm tra lại được.');
  if (data.sapo && !out.sapo) out.notes.push('Tóm tắt: không điền và kiểm tra lại được.');

  // ---- 7. Nội dung ----
  try { out.body = await fillBody(data.html); } catch (e) { out.body = false; out.notes.push('Lỗi khi điền nội dung: ' + e.message); }

  // Ảnh trong bài: thay từng dấu [[ẢNH n]] bằng ảnh đã tải, qua nút chèn ảnh của trình soạn thảo, đúng vị trí dấu.
  async function uploadBodyImages(list) {
    const res = { ok: 0, fail: [] };
    const f = fieldEl('body');
    const ed = f && T.tinyEditors().find((e) => { try { return f.contains(e.getContainer()); } catch (x) { return false; } });
    const btn = f && [...f.querySelectorAll('button, [role=button]')].filter(visible)
      .find((b) => /\bimage\b|hinh anh|chen anh/.test(norm(b.getAttribute('aria-label') || b.title || '')));
    const dlgFile = () => [...document.querySelectorAll('input[type=file]')].reverse().find((i) => i.closest('.tox-dialog, [role=dialog], .v-dialog, .v-card')) || null;
    const closeDialog = () => {
      const c = [...document.querySelectorAll('.tox-dialog button')].filter(visible).find((b) => /^(huy|cancel|dong|close)$/.test(norm(text(b))));
      if (c) c.click();
    };
    for (const im of list) {
      const marker = `[[ẢNH ${im.n}]]`;
      if (!ed || !btn) { res.fail.push(`ảnh ${im.n} (không thấy trình soạn thảo hoặc nút chèn ảnh)`); continue; }
      const body = ed.getBody();
      const walker = body.ownerDocument.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      let hit = null; let node;
      while ((node = walker.nextNode())) { const i = node.nodeValue.indexOf(marker); if (i >= 0) { hit = { node, i }; break; } }
      if (!hit) { res.fail.push(`ảnh ${im.n} (không thấy dấu ${marker} trong bài)`); continue; }
      const rng = ed.dom.createRng();
      rng.setStart(hit.node, hit.i); rng.setEnd(hit.node, hit.i + marker.length);
      ed.selection.setRng(rng); ed.focus();
      const before = body.querySelectorAll('img').length;
      btn.click();
      let input = await waitFor(dlgFile, 3000);
      if (!input) {
        const tab = [...document.querySelectorAll('.tox-dialog button, [role=tab]')].filter(visible).find((b) => /tai len|upload/.test(norm(text(b))));
        if (tab) { tab.click(); input = await waitFor(dlgFile, 3000); }
      }
      if (!input) { res.fail.push(`ảnh ${im.n} (không thấy ô chọn tệp trong hộp chèn ảnh)`); closeDialog(); continue; }
      const bin = atob(im.b64);
      const u8 = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
      const dt = new DataTransfer();
      dt.items.add(new File([u8], im.name, { type: im.mime || 'image/jpeg' }));
      input.files = dt.files;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(2500);
      const primary = [...document.querySelectorAll('.tox-dialog__footer button, .tox-dialog button.tox-button--primary')].filter(visible).pop();
      if (primary) primary.click();
      const added = await waitFor(() => body.querySelectorAll('img').length > before, 20000, 300);
      if (!added) { res.fail.push(`ảnh ${im.n} (chưa thấy ảnh được chèn)`); closeDialog(); continue; }
      if (hit.node.isConnected && hit.node.nodeValue.includes(marker)) hit.node.nodeValue = hit.node.nodeValue.replace(marker, '');
      res.ok++;
    }
    return res;
  }
  if (data.bodyImages && data.bodyImages.length) {
    try { out.images = await uploadBodyImages(data.bodyImages); }
    catch (e) { out.images = { ok: 0, fail: data.bodyImages.map((x) => 'ảnh ' + x.n + ' (' + e.message + ')') }; }
  }
  if (data.imageFails && data.imageFails.length) out.images = Object.assign({ ok: 0, fail: [] }, out.images, { fail: [...((out.images && out.images.fail) || []), ...data.imageFails] });

  // ---- 8. Bấm nút lưu (chỉ khi mọi ô đều điền được) ----
  if (opts.autoSubmit) {
    const btn = T.resolve(map.submit);
    const failed = ['title', 'sapo', 'body', 'author', 'date', 'cover', 'category'].some((k) => out[k] === false);
    if (!btn || !visible(btn)) out.submit = false;
    else if (failed) { out.submit = false; out.notes.push('Còn ô chưa điền được nên không tự bấm nút lưu.'); }
    else if (out.images && out.images.fail && out.images.fail.length) { out.submit = false; out.notes.push('Còn ảnh chưa chèn được nên không tự bấm nút lưu.'); }
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
  lines.push('tinymce: ' + (t ? (t.majorVersion + '.' + t.minorVersion) : 'không có'));
  lines.push('--- Các khối .field ---');
  for (const f of document.querySelectorAll('.field')) {
    if (!T.visible(f)) continue;
    const itf = f.querySelector('.interface');
    const kids = itf ? [...itf.querySelectorAll('input, textarea, button, iframe, .v-list-item')].slice(0, 5).map((k) => k.tagName.toLowerCase() + (k.type ? '[' + k.type + ']' : '') + (cls(k) ? '.' + cls(k) : '')).join(', ') : '';
    lines.push(T.fieldLabel(f) + ' | ' + cls(f) + ' | ' + kids);
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
