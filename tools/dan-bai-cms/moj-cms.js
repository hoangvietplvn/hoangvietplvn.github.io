// Chạy trong trang CMS Cổng thông tin Bộ Tư pháp (moj.gov.vn/cms) và trong cửa sổ kho ảnh (portalmedia.moj.gov.vn).
// Ô được tìm theo tên hiển thị trên form («Tiêu đề», «Tóm tắt», «Chú thích ảnh đại diện»...), không theo vị trí.
// Mỗi hàm phải tự chứa toàn bộ vì được tiêm qua chrome.scripting.executeScript.

// eslint-disable-next-line no-unused-vars
function mojTools() {
  const T = {};
  T.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  T.waitFor = async (fn, ms = 6000, step = 150) => {
    const t0 = Date.now();
    for (;;) {
      let v = null;
      try { v = await fn(); } catch (e) { v = null; }
      if (v) return v;
      if (Date.now() - t0 > ms) return null;
      await T.sleep(step);
    }
  };
  T.norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
  T.visible = (el) => { if (!el || !el.isConnected) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  T.area = (el) => { const r = el.getBoundingClientRect(); return r.width * r.height; };
  T.text = (el) => {
    if (!el) return '';
    let t = el.textContent || '';
    if (el.querySelector && el.querySelector('style, script')) {
      const c = el.cloneNode(true);
      c.querySelectorAll('style, script').forEach((x) => x.remove());
      t = c.textContent || '';
    }
    return t.replace(/\s+/g, ' ').trim();
  };
  // Tên ô: bỏ dấu sao bắt buộc «(*)», «*» và dấu hai chấm.
  T.labelText = (s) => T.norm(s).replace(/\(\s*\*\s*\)|\*/g, '').replace(/\s*:\s*$/, '').trim();

  T.findLabel = (re) => [...document.body.querySelectorAll('*')]
    .filter((e) => !/^(SCRIPT|STYLE|OPTION|FLUENT-OPTION|SVG|PATH)$/i.test(e.tagName) && (e.textContent || '').length < 400
      && re.test(T.labelText(T.text(e))) && T.visible(e) && !e.closest('.tox, [contenteditable], nav, .fluent-nav-menu'))
    .sort((a, b) => T.area(a) - T.area(b))[0] || null;

  T.FLUENT = 'fluent-text-field, fluent-text-area, fluent-search, fluent-number-field';
  T.CTRL = T.FLUENT + ', input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, [contenteditable="true"], [contenteditable=""]';
  // Ô nhập đứng ngay sau tên ô, tìm dần ra các khối bao ngoài.
  T.controlAfter = (label, sel, levels = 6) => {
    sel = sel || T.CTRL;
    const lab = label.closest('label') || label;
    const forId = lab.getAttribute && lab.getAttribute('for');
    if (forId) {
      const c = document.getElementById(forId);
      const hit = c && (c.matches(sel) ? c : c.querySelector(sel));
      if (hit) return hit;
    }
    for (let a = label.parentElement, i = 0; a && i < levels; a = a.parentElement, i++) {
      const hit = [...a.querySelectorAll(sel)].find((c) => T.visible(c) && !label.contains(c) && !c.closest('.tox')
        && (label.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING));
      if (hit) return hit;
    }
    return null;
  };

  T.valueOf = (el) => (el ? ('value' in el && typeof el.value === 'string' ? el.value : el.textContent || '') : '');

  T.setValue = (el, value) => {
    const win = el.ownerDocument.defaultView;
    const proto = el instanceof win.HTMLTextAreaElement ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(el, value); else el.value = value;
    for (const type of ['input', 'change']) el.dispatchEvent(new Event(type, { bubbles: true }));
  };

  // Gõ chữ vào ô như người dùng (chọn hết rồi chèn) để CMS ghi nhận giá trị; không được thì gán trực tiếp.
  T.setText = (el, value) => {
    const doc = el.ownerDocument;
    const same = () => T.valueOf(el).replace(/\s+/g, ' ').trim() === value.replace(/\s+/g, ' ').trim();
    try { el.focus(); } catch (e) { /* bỏ qua */ }
    if (/^FLUENT-/.test(el.tagName)) {
      // Thành phần Fluent UI: gán giá trị cho thành phần rồi báo input/change để Blazor ghi nhận.
      el.value = value;
      const inner = el.control || (el.shadowRoot && el.shadowRoot.querySelector('input, textarea'));
      if (inner && inner.value !== value) { try { inner.value = value; } catch (e) { /* bỏ qua */ } }
      for (const type of ['input', 'change']) el.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
      return same();
    }
    if (typeof el.value === 'string') {
      try { el.select(); } catch (e) { /* ô không hỗ trợ chọn */ }
      try { doc.execCommand('insertText', false, value); } catch (e) { /* bỏ qua */ }
      if (!same()) T.setValue(el, value);
    } else {
      try {
        const sel = doc.getSelection(); const range = doc.createRange();
        range.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(range);
        doc.execCommand('insertText', false, value);
      } catch (e) { /* bỏ qua */ }
      if (!same()) { el.textContent = value; el.dispatchEvent(new InputEvent('input', { bubbles: true })); }
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return same();
  };

  T.click = (el) => {
    const win = el.ownerDocument.defaultView;
    try { el.scrollIntoView({ block: 'center' }); } catch (e) { /* bỏ qua */ }
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      const Ev = type.startsWith('pointer') ? win.PointerEvent : win.MouseEvent;
      el.dispatchEvent(new Ev(type, { bubbles: true, cancelable: true, view: win }));
    }
    el.click();
  };

  T.isOff = (b) => !b || b.disabled || b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true' || /(^|\s)(disabled|p-disabled)(\s|$)/.test(typeof b.className === 'string' ? b.className : '');
  T.BTN = 'button, a, [role=button], input[type=button], fluent-button, fluent-anchor';
  T.buttons = (re, root) => [...(root || document).querySelectorAll(T.BTN)]
    .filter((b) => T.visible(b) && re.test(T.norm(T.text(b) || b.value || '')))
    .sort((a, b) => T.area(a) - T.area(b));

  T.tinyEditors = () => {
    const t = window.tinymce;
    if (!t) return [];
    let list = [];
    try { list = (t.get && t.get()) || []; } catch (e) { list = []; }
    if (!Array.isArray(list) || !list.length) list = t.editors || [];
    return [...list].filter((e) => { try { return e && e.initialized !== false && e.getContainer && e.getContainer() && T.visible(e.getContainer()); } catch (x) { return false; } })
      .sort((a, b) => T.area(b.getContainer()) - T.area(a.getContainer()));
  };

  // Thanh thông báo ở cuối trang, dùng khi cần người dùng bấm giúp một bước.
  T.banner = (msg, ok) => {
    let bar = document.getElementById('moj-dan-bai-bar');
    if (!msg) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'moj-dan-bai-bar';
      document.documentElement.appendChild(bar);
    }
    bar.textContent = msg;
    bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:2147483647;pointer-events:none;padding:10px 16px;color:#fff;font:600 15px system-ui,sans-serif;text-align:center;box-shadow:0 -2px 8px rgba(0,0,0,.3);background:' + (ok ? '#1b6e2d' : '#a61b1b');
  };
  return T;
}

// eslint-disable-next-line no-unused-vars
function mojBanner(msg, ok) { mojTools().banner(msg, ok); return true; }

// ---------- Trang «Thêm mới bài viết» ----------
// Điền tiêu đề, tóm tắt, nội dung và (nếu có) chuyên mục chính.
// true = đã điền và kiểm tra lại được, false = thử nhưng không được, null = không làm.
// eslint-disable-next-line no-unused-vars
async function mojFill(data, waitMs) {
  const T = mojTools();
  const { sleep, waitFor, norm, visible, text } = T;
  const out = { title: null, sapo: null, body: null, category: null, noForm: false, busy: false, notes: [] };

  const titleLabel = await waitFor(() => T.findLabel(/^tieu de$/), waitMs || 15000, 300);
  const titleEl = titleLabel && T.controlAfter(titleLabel);
  if (!titleEl) {
    out.noForm = true;
    out.notes.push('Không thấy form «Thêm mới bài viết» trên CMS. Hãy đăng nhập CMS, mở Tin tức → Thêm mới tin bài, rồi bấm lại.');
    return out;
  }
  await sleep(800); // form còn tải dữ liệu nền sau khi hiện ra

  // Không ghi đè lên một bài khác đang soạn dở.
  const cur = T.valueOf(titleEl).replace(/\s+/g, ' ').trim();
  if (cur && cur !== data.title.replace(/\s+/g, ' ').trim()) {
    out.busy = true;
    out.notes.push('Form trên CMS đang có bài khác («' + cur.slice(0, 60) + '»). Hãy lưu bài đó hoặc mở trang «Thêm mới tin bài» trống rồi bấm lại.');
    return out;
  }

  // ---- Nội dung (TinyMCE) ----
  function setTiny(ed, html) {
    try { ed.focus(); } catch (e) { /* bỏ qua */ }
    ed.setContent('');
    try { ed.execCommand('mceInsertContent', false, html); } catch (e) { ed.setContent(html); }
    if (!ed.getContent()) ed.setContent(html);
    try { if (ed.setDirty) ed.setDirty(true); } catch (e) { /* bỏ qua */ }
    const fire = ed.dispatch || ed.fire;
    for (const ev of ['input', 'change']) { try { fire.call(ed, ev); } catch (e) { /* bỏ qua */ } }
    try { if (ed.save) ed.save(); } catch (e) { /* bỏ qua */ }
    return !!ed.getContent();
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
    return !!el.textContent.trim();
  }
  const editFrame = () => [...document.querySelectorAll('.tox-edit-area iframe, iframe.tox-edit-area__iframe, iframe')]
    .filter(visible).map((f) => { try { return f.contentDocument && f.contentDocument.body; } catch (e) { return null; } })
    .find((b) => b && (b.isContentEditable || b.ownerDocument.designMode === 'on')) || null;
  async function fillBody(html) {
    await waitFor(() => T.tinyEditors().length || editFrame(), 10000, 250);
    const ed = T.tinyEditors()[0];
    if (ed) return setTiny(ed, html);
    const b = editFrame();
    if (b) return setEditable(b, html);
    out.notes.push('Nội dung: không thấy trình soạn thảo trên trang.');
    return false;
  }
  try { out.body = await fillBody(data.html); } catch (e) { out.body = false; out.notes.push('Lỗi khi điền nội dung: ' + e.message); }

  // ---- Chuyên mục chính (không bắt buộc): mở hộp chọn rồi bấm dòng trùng tên ----
  async function setCategory(name) {
    const want = norm(name);
    const label = T.findLabel(/^chuyen muc chinh$/);
    if (!label) { out.notes.push('Chuyên mục: không thấy ô «Chuyên mục chính».'); return false; }
    const native = T.controlAfter(label, 'select');
    if (native) {
      const opt = [...native.options].find((o) => norm(o.textContent) === want);
      if (!opt) { out.notes.push('Chuyên mục: không có mục «' + name + '».'); return false; }
      native.value = opt.value;
      for (const type of ['input', 'change']) native.dispatchEvent(new Event(type, { bubbles: true }));
      return true;
    }
    const fl = T.controlAfter(label, 'fluent-select, fluent-combobox');
    if (fl) {
      const opt = [...fl.querySelectorAll('fluent-option')].find((o) => norm(text(o)) === want);
      if (!opt) { out.notes.push('Chuyên mục: không có mục «' + name + '» trong hộp chọn.'); return false; }
      const picked = () => !!opt.selected || norm(String(fl.displayValue || '')) === want || (opt.value !== undefined && opt.value !== '' && fl.value === opt.value);
      if (picked()) return true;
      T.click(fl);
      await sleep(400);
      T.click(opt);
      await sleep(500);
      if (!picked()) {
        try { fl.value = opt.value; } catch (e) { /* bỏ qua */ }
        fl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        await sleep(300);
      }
      if (fl.open) { try { fl.open = false; } catch (e) { /* bỏ qua */ } }
      return picked();
    }
    const box = T.controlAfter(label, '[role=combobox], [aria-haspopup], p-dropdown, p-select, .p-dropdown, .p-select, ng-select, nz-select, mat-select, dx-select-box')
      || T.controlAfter(label, 'input:not([type=hidden]):not([type=checkbox]), [tabindex]');
    if (!box) { out.notes.push('Chuyên mục: không thấy hộp chọn sau ô «Chuyên mục chính».'); return false; }
    const shown = () => norm(text(box)) + ' ' + norm(box.value || '');
    if (shown().includes(want)) return true;
    // Chỉ bấm vào dòng mới hiện ra sau khi mở hộp, để không đánh dấu nhầm ở bảng «Chuyên mục phụ».
    const matches = () => [...document.querySelectorAll('fluent-option, li, [role=option], .p-dropdown-item, .p-select-option, .ng-option, .ant-select-item, mat-option, .dx-item, span, div')]
      .filter((e) => visible(e) && norm(text(e)) === want);
    const before = new Set(matches());
    let leaf = box; while (leaf.firstElementChild && visible(leaf.firstElementChild)) leaf = leaf.firstElementChild;
    T.click(leaf);
    let row = await waitFor(() => matches().find((e) => !before.has(e)), 3000);
    if (!row) {
      const filter = [...document.querySelectorAll('input[type=text], input[type=search], input:not([type])')]
        .find((i) => visible(i) && i === document.activeElement && i !== titleEl);
      if (filter) { T.setValue(filter, name); row = await waitFor(() => matches().find((e) => !before.has(e)), 3000); }
    }
    if (!row) {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      out.notes.push('Chuyên mục: không thấy dòng «' + name + '» trong hộp chọn; hãy chọn tay.');
      return false;
    }
    T.click(row);
    await sleep(500);
    return shown().includes(want);
  }
  if (data.category) { try { out.category = await setCategory(data.category); } catch (e) { out.category = false; out.notes.push('Chuyên mục: ' + e.message); } }

  // ---- Tiêu đề, tóm tắt: điền sau cùng rồi kiểm tra lại ----
  const fields = [['title', /^tieu de$/, data.title], ['sapo', /^tom tat$/, data.sapo]];
  for (let pass = 0; pass < 2; pass++) {
    for (const [kind, re, value] of fields) {
      if (!value) continue;
      const label = T.findLabel(re);
      const el = label && T.controlAfter(label);
      if (!el) { out[kind] = false; continue; }
      if (T.valueOf(el).replace(/\s+/g, ' ').trim() === value.replace(/\s+/g, ' ').trim()) { out[kind] = true; continue; }
      out[kind] = T.setText(el, value);
    }
    await sleep(600);
  }
  if (!out.title) out.notes.push('Tiêu đề: không điền và kiểm tra lại được.');
  if (data.sapo && !out.sapo) out.notes.push('Tóm tắt: không điền và kiểm tra lại được.');
  try { window.scrollTo(0, 0); titleEl.scrollIntoView({ block: 'center' }); } catch (e) { /* bỏ qua */ }
  return out;
}

// Ô «Chú thích ảnh đại diện» chỉ hiện sau khi bài đã có ảnh đại diện.
// eslint-disable-next-line no-unused-vars
function mojCoverState() {
  const T = mojTools();
  return { has: !!T.findLabel(/^chu thich anh dai dien$/), button: !!T.buttons(/^chon anh( moi)?$/)[0] };
}

// eslint-disable-next-line no-unused-vars
function mojClickCover() {
  const T = mojTools();
  const b = T.buttons(/^chon anh( moi)?$/)[0];
  if (!b) return false;
  T.click(b);
  return true;
}

// Sau khi cửa sổ kho ảnh đóng: chờ ảnh hiện trên form rồi điền chú thích.
// eslint-disable-next-line no-unused-vars
async function mojAfterCover(caption, ms) {
  const T = mojTools();
  const label = await T.waitFor(() => T.findLabel(/^chu thich anh dai dien$/), ms || 15000, 300);
  if (!label) return { cover: false, caption: null };
  if (!caption) return { cover: true, caption: null };
  const el = T.controlAfter(label);
  if (!el) return { cover: true, caption: false };
  await T.sleep(300);
  return { cover: true, caption: T.setText(el, caption) };
}

// Bấm «Lưu và ở lại trang» (bài được lưu nháp, chưa gửi duyệt, chưa công khai).
// eslint-disable-next-line no-unused-vars
async function mojSave() {
  const T = mojTools();
  const b = T.buttons(/^luu va o lai trang$/)[0];
  if (!b || T.isOff(b)) return false;
  const path = location.pathname;
  T.click(b);
  return !!(await T.waitFor(() => location.pathname !== path || /chinh sua bai viet/.test(T.norm(document.body.innerText).slice(0, 4000)), 20000, 300));
}

// ---------- Cửa sổ kho ảnh (portalmedia) ----------
// Tải tệp ảnh lên kho, đóng hộp «Tải lên file», rồi tìm ô ảnh vừa tải (viền đỏ, lưu ở window.__mojTile).
// eslint-disable-next-line no-unused-vars
async function mojMediaUpload(file) {
  const T = mojTools();
  const { sleep, waitFor, norm, visible, text } = T;
  const bigImgs = () => [...document.querySelectorAll('img')].filter((i) => { const r = i.getBoundingClientRect(); return r.width >= 80 && r.height >= 60; });
  const pageText = () => norm(document.body.innerText || '');

  await waitFor(() => bigImgs().length || /ban ghi/.test(pageText()), 20000, 300);
  if (document.querySelector('input[type=password]')) return { ok: false, why: 'kho ảnh yêu cầu đăng nhập' };
  const firstBefore = (bigImgs()[0] || {}).src || '';
  const steps = [];

  // Hộp «Tải lên file»: vùng kéo thả và nút Đóng.
  const dropZone = () => [...document.body.querySelectorAll('*')]
    .filter((e) => !/^(SCRIPT|STYLE)$/.test(e.tagName) && /keo tha files?/.test(norm(e.textContent)) && visible(e))
    .sort((a, b) => T.area(a) - T.area(b))[0] || null;
  const dialogOf = (zone) => { for (let a = zone; a && a !== document.body; a = a.parentElement) if (T.buttons(/^dong$/, a)[0]) return a; return null; };
  const fileInput = () => {
    const z = dropZone(); const d = z && dialogOf(z);
    return (d && d.querySelector('input[type=file]')) || document.querySelector('input[type=file]');
  };

  // Mở hộp tải lên. Nút «Tải lên» chỉ hiện sau khi chọn một thư mục, nên bấm thư mục «Default» trước.
  // Nút có chữ, tên hoặc biểu tượng «tải lên / upload» (không phải thư mục «Upload từ xa»);
  // không nhận ra thì thử nút chỉ có biểu tượng vừa hiện ra sau khi chọn thư mục, hoặc nút biểu tượng ở góc trên bên phải.
  if (!dropZone() && !fileInput()) {
    const hint = (b) => norm([text(b), b.title, b.getAttribute('aria-label'), b.getAttribute('ptooltip'), b.getAttribute('ng-reflect-content'),
      typeof b.className === 'string' ? b.className : '', ...[...b.querySelectorAll('i, span, svg, use')].map((x) => (typeof x.className === 'string' ? x.className : '') + ' ' + (x.getAttribute('href') || ''))].join(' '));
    const inTree = (b) => !!b.closest('[role=tree], [role=treeitem], fluent-tree-view, fluent-tree-item, p-tree, .p-tree');
    const allBtns = () => [...document.querySelectorAll(T.BTN)].filter((b) => visible(b) && !inTree(b));
    const named = () => allBtns().filter((b) => !/tu xa/.test(norm(text(b))) && /tai len|upload/.test(hint(b)))
      .sort((a, b) => (/tai len/.test(hint(b)) ? 1 : 0) - (/tai len/.test(hint(a)) ? 1 : 0));
    // Tên thư mục trên kho ảnh có kèm biểu tượng (ví dụ «🎁 Default») nên chỉ so phần chữ.
    const letters = (t) => norm(t).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const ownText = (e) => letters([...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join(' '));
    const ITEM = 'fluent-tree-item, [role=treeitem]';
    // Cây thư mục chỉ nhận cú bấm vào chính dòng thư mục (không phải phần chữ bên trong), nên lấy dòng bao ngoài.
    const folder = () => {
      const hit = [...document.body.querySelectorAll('*')]
        .filter((e) => !/^(SCRIPT|STYLE)$/.test(e.tagName) && (letters(e.textContent) === 'default' || ownText(e) === 'default') && visible(e))
        .sort((a, b) => T.area(a) - T.area(b))[0];
      return hit ? (hit.closest(ITEM) || hit) : null;
    };
    const isSel = (e) => e.selected === true || e.getAttribute('aria-selected') === 'true' || e.hasAttribute('selected');

    const beforeBtns = new Set(allBtns());
    const fd = await waitFor(folder, 8000, 300);
    steps.push(fd ? 'thấy thư mục Default (' + fd.tagName.toLowerCase() + ')' : 'không thấy thư mục Default');
    if (fd) {
      const appeared = () => named()[0] || allBtns().some((b) => !beforeBtns.has(b));
      await sleep(800); // chờ trang gắn xong xử lý sự kiện
      if (!isSel(fd)) T.click(fd);
      let ok = await waitFor(appeared, 4000, 200);
      if (!ok && fd.matches(ITEM)) {
        // Bấm lần nữa nếu thư mục chưa được chọn (bấm khi đang chọn sẽ bỏ chọn), rồi mới gán trực tiếp.
        if (!isSel(fd)) { fd.click(); ok = await waitFor(appeared, 2500, 200); }
        if (!ok && !isSel(fd)) {
          try { fd.selected = true; } catch (e) { /* bỏ qua */ }
          for (const type of ['selected-change', 'change']) fd.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail: fd }));
          ok = await waitFor(appeared, 2500, 200);
        }
      }
      steps.push(ok ? 'nút mới đã hiện sau khi bấm Default' : 'bấm Default nhưng không thấy nút mới');
      await sleep(500);
    }

    const iconOnly = (b) => !text(b) && b.querySelector('svg, i, img');
    const fresh = allBtns().filter((b) => !beforeBtns.has(b) && iconOnly(b));
    const topRight = allBtns().filter((b) => iconOnly(b) && b.getBoundingClientRect().top < 220 && b.getBoundingClientRect().left > window.innerWidth * 0.6);
    const byRight = (a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right;
    const tries = [...new Set([...named(), ...fresh.sort(byRight), ...topRight.sort(byRight)])].slice(0, 3);
    steps.push('nút thử bấm: ' + (tries.map((b) => (text(b) || b.title || b.getAttribute('aria-label') || 'biểu tượng').slice(0, 20)).join(', ') || 'không có'));
    let opened = false;
    for (const b of tries) {
      T.click(b);
      if (await waitFor(() => dropZone() || fileInput(), 4000)) { opened = true; break; }
    }
    if (!opened) {
      T.banner('Hãy bấm thư mục «Default» rồi bấm nút «Tải lên» trong cửa sổ này. Tiện ích sẽ tự chọn tệp và làm tiếp.');
      opened = await waitFor(() => dropZone() || fileInput(), 90000, 300);
      T.banner('');
      if (!opened) return { ok: false, why: 'không mở được hộp «Tải lên file»: ' + steps.join('; ') };
    }
    await sleep(400);
  }

  const bin = atob(file.b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const makeDt = () => { const dt = new DataTransfer(); dt.items.add(new File([u8], file.name, { type: file.mime || 'image/jpeg' })); return dt; };
  const prefix = norm(file.name).slice(0, 8);
  const started = () => pageText().includes(prefix) || /tai thanh cong|hoan thanh|dang tai/.test(pageText());

  const input = fileInput();
  if (input) {
    input.files = makeDt().files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (!(await waitFor(started, input ? 6000 : 100, 200))) {
    const z = dropZone();
    if (z) {
      for (const type of ['dragenter', 'dragover', 'drop']) z.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: makeDt() }));
    }
  }
  const done = await waitFor(() => /tai thanh cong|hoan thanh/.test(pageText()), 180000, 400);
  if (!done) return { ok: false, why: 'đã mở hộp «Tải lên file» nhưng kho ảnh không báo tải xong (' + (input ? 'có ô chọn tệp' : 'không có ô chọn tệp') + ')' };
  await sleep(500);

  const z = dropZone(); const dlg = z && dialogOf(z);
  const close = dlg && T.buttons(/^dong$/, dlg)[0];
  if (close) T.click(close);
  await waitFor(() => !dropZone(), 5000, 200);

  // Ô ảnh vừa tải: theo tên tệp; không thấy thì lấy ô đầu tiên nếu ô này mới xuất hiện sau khi tải.
  const byName = () => {
    const leaf = [...document.body.querySelectorAll('*')]
      .filter((e) => !e.children.length && !/^(SCRIPT|STYLE)$/.test(e.tagName) && norm(e.textContent).startsWith(prefix) && visible(e))[0];
    for (let a = leaf; a && a !== document.body; a = a.parentElement) { const im = a.querySelector('img'); if (im) return im; }
    return null;
  };
  let img = await waitFor(byName, 20000, 300);
  let how = 'tên tệp';
  if (!img) { const first = bigImgs()[0]; if (first && first.src !== firstBefore) { img = first; how = 'ảnh mới nhất'; } }
  if (!img) return { ok: false, why: 'ảnh đã tải lên kho nhưng không thấy trong danh sách' };
  img.scrollIntoView({ block: 'center' });
  img.style.outline = '4px solid #a61b1b';
  window.__mojTile = img;
  return { ok: true, how };
}

// Chọn ảnh đã đánh dấu: bấm một lần, rồi bấm đúp. Trả về ngay vì cửa sổ thường tự đóng khi ảnh được chọn.
// eslint-disable-next-line no-unused-vars
function mojMediaChoose() {
  const T = mojTools();
  const img = window.__mojTile;
  if (!img || !img.isConnected) return false;
  const fire = (type, detail) => img.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, detail }));
  T.click(img);
  setTimeout(() => {
    if (!img.isConnected) return;
    for (const d of [1, 2]) { fire('mousedown', d); fire('mouseup', d); fire('click', d); }
    fire('dblclick', 2);
  }, 900);
  return true;
}

// Bản mô tả cấu trúc trang (không kèm nội dung đã nhập) để gửi cho người hỗ trợ khi tiện ích điền sai.
// eslint-disable-next-line no-unused-vars
function mojDiag() {
  const T = mojTools();
  const cls = (el) => (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 4).join('.');
  const tagOf = (n) => n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (cls(n) ? '.' + cls(n) : '');
  const chain = (el, depth = 4) => { const p = []; for (let n = el, i = 0; n && n !== document.body && i < depth; n = n.parentElement, i++) p.push(tagOf(n)); return p.join(' < '); };
  const attrs = (el) => [...el.attributes].filter((a) => !/^(_ng|value$|class$|style$|id$|src$|href$)/.test(a.name)).map((a) => a.name + '=' + a.value.slice(0, 40)).join(' ');
  const lines = ['URL: ' + location.origin + location.pathname];
  const ng = document.querySelector('[ng-version]');
  lines.push('angular: ' + (ng ? ng.getAttribute('ng-version') : 'không rõ'));
  const t = window.tinymce;
  lines.push('tinymce: ' + (t ? (t.majorVersion + '.' + t.minorVersion + ', ' + T.tinyEditors().length + ' trình soạn thảo') : 'không có'));
  lines.push('--- Ô theo tên ---');
  for (const [name, re] of [['Tiêu đề', /^tieu de$/], ['Tóm tắt', /^tom tat$/], ['Chú thích ảnh', /^chu thich anh dai dien$/], ['Chuyên mục chính', /^chuyen muc chinh$/]]) {
    const l = T.findLabel(re); const c = l && T.controlAfter(l);
    lines.push(name + ' | nhãn: ' + (l ? chain(l, 2) : 'không thấy') + ' | ô: ' + (c ? chain(c, 3) : 'không thấy'));
    if (name === 'Chuyên mục chính' && l) {
      let n = l.parentElement; for (let i = 0; i < 3 && n && n.parentElement && n.parentElement !== document.body; i++) n = n.parentElement;
      if (n) lines.push('  khối: ' + [...n.querySelectorAll('*')].filter(T.visible).slice(0, 25).map(tagOf).join(' | '));
    }
  }
  const custom = {};
  for (const el of document.body.querySelectorAll('*')) if (el.tagName.includes('-')) custom[el.tagName.toLowerCase()] = (custom[el.tagName.toLowerCase()] || 0) + 1;
  lines.push('--- Thành phần tùy biến ---');
  lines.push(Object.entries(custom).map(([k, v]) => k + '×' + v).join(', '));
  lines.push('--- Nhãn ---');
  for (const l of document.querySelectorAll('label, fluent-label')) {
    if (!T.visible(l) || l.closest('.tox')) continue;
    const c = T.controlAfter(l);
    lines.push('«' + T.text(l).slice(0, 50) + '» | ' + tagOf(l) + ' for=' + (l.getAttribute('for') || '') + ' | ô: ' + (c ? tagOf(c) : 'không thấy'));
  }
  lines.push('--- Ô nhập ---');
  for (const el of document.querySelectorAll('input, textarea, select, iframe, [contenteditable=true], fluent-text-field, fluent-text-area, fluent-select, fluent-combobox, fluent-checkbox, fluent-switch, fluent-search')) {
    if (el.closest('.tox') && el.tagName !== 'IFRAME') continue;
    if (el.closest('nav, .navmenu')) continue;
    lines.push((T.visible(el) ? '' : '(ẩn) ') + chain(el, 3) + ' | ' + attrs(el).slice(0, 200) + (/^FLUENT-(SELECT|COMBOBOX)$/.test(el.tagName) ? ' | ' + el.querySelectorAll('fluent-option').length + ' fluent-option' : ''));
  }
  lines.push('--- Nút ---');
  for (const b of document.querySelectorAll(T.BTN)) {
    if (!T.visible(b) || b.closest('.tox, nav, .fluent-nav-menu, header')) continue;
    lines.push('«' + T.text(b).slice(0, 40) + '» | ' + chain(b, 3) + ' | ' + attrs(b).slice(0, 160) + (b.querySelector('svg') ? ' | có biểu tượng' : ''));
  }
  lines.push('--- Khối chuyên mục ---');
  const cm = [...document.body.querySelectorAll('*')].filter((e) => !/^(SCRIPT|STYLE)$/.test(e.tagName) && (e.textContent || '').length < 300 && /chuyen muc chinh/.test(T.norm(T.text(e))) && T.visible(e)).sort((a, b) => T.area(a) - T.area(b))[0];
  if (cm) {
    lines.push('nhãn: ' + chain(cm, 4) + ' | chữ: «' + T.text(cm).slice(0, 60) + '»');
    let n = cm; for (let k = 0; k < 3 && n.parentElement && n.parentElement !== document.body; k++) n = n.parentElement;
    lines.push('khối: ' + [...n.querySelectorAll('*')].filter(T.visible).slice(0, 40).map(tagOf).join(' | '));
  } else lines.push('không thấy chữ «Chuyên mục chính»');
  lines.push('--- Cây thư mục ---');
  for (const el of [...document.querySelectorAll('fluent-tree-view, fluent-tree-item, [role=tree], [role=treeitem]')].slice(0, 8)) {
    lines.push(chain(el, 3) + ' | ' + attrs(el).slice(0, 160) + ' | chữ: «' + T.text(el).slice(0, 40) + '» | con: ' + [...el.children].slice(0, 6).map(tagOf).join(', '));
  }
  lines.push('--- Ảnh lớn (tối đa 3) ---');
  [...document.querySelectorAll('img')].filter((i) => i.getBoundingClientRect().width >= 80).slice(0, 3).forEach((i) => lines.push(chain(i, 5)));
  return lines.join('\n').slice(0, 16000);
}
