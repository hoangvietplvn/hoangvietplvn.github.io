// Chạy trong trang CMS (ngữ cảnh của trang) để điền bài vào form soạn thảo.
// Hàm phải tự chứa toàn bộ vì được tiêm qua chrome.scripting.executeScript.
// eslint-disable-next-line no-unused-vars
function danBaiFill(data, map, autoSubmit) {
  const out = { title: false, sapo: false, body: false, author: null, source: null, submit: null, notes: [] };
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const area = (el) => { const r = el.getBoundingClientRect(); return r.width * r.height; };

  const PAT = {
    title: /title|tieu[\s_-]?de|headline|\btit\b|\bten bai/,
    sapo: /sapo|summary|excerpt|tom[\s_-]?tat|mo[\s_-]?ta|description|\blead\b|intro|trich[\s_-]?dan|gioi thieu/,
    body: /content|body|noi[\s_-]?dung|detail|chi[\s_-]?tiet|fulltext/,
  };
  const NOT = /seo|meta|sub|phu|slug|url|keyword|tag|search|tim kiem|anh|image|caption|chu thich/;

  function describe(el) {
    const doc = el.ownerDocument;
    const parts = [el.name, el.id, el.getAttribute('placeholder'), el.getAttribute('aria-label'), el.getAttribute('data-field')];
    if (el.id) { const l = doc.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) parts.push(l.textContent); }
    const wrap = el.closest('label, .form-group, .form-item, .field, .form-row, .ant-form-item, .el-form-item, tr');
    if (wrap) { const l = wrap.matches('label') ? wrap : wrap.querySelector('label, th, .label'); if (l) parts.push(l.textContent); }
    return norm(parts.filter(Boolean).join(' | '));
  }

  function resolve(m) {
    if (!m || !m.selector) return null;
    let doc = document;
    if (m.frame) {
      const f = document.querySelector(m.frame);
      try { doc = f && f.contentDocument; } catch (e) { doc = null; }
      if (!doc) return null;
    }
    try { return doc.querySelector(m.selector); } catch (e) { return null; }
  }

  function setValue(el, value) {
    const proto = el instanceof el.ownerDocument.defaultView.HTMLTextAreaElement
      ? el.ownerDocument.defaultView.HTMLTextAreaElement.prototype
      : el.ownerDocument.defaultView.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value');
    el.focus();
    if (setter && setter.set) setter.set.call(el, value); else el.value = value;
    for (const type of ['input', 'change']) el.dispatchEvent(new Event(type, { bubbles: true }));
    el.blur();
  }

  // Trình soạn thảo gắn với một textarea (CKEditor 4, TinyMCE, Summernote).
  function editorFor(el) {
    const keys = [el.id, el.name].filter(Boolean);
    if (window.CKEDITOR && CKEDITOR.instances) for (const k of keys) if (CKEDITOR.instances[k]) return (h) => CKEDITOR.instances[k].setData(h);
    if (window.tinymce && tinymce.get) for (const k of keys) {
      const ed = tinymce.get(k);
      if (ed && ed.setContent) return (h) => { ed.setContent(h); ed.fire && ed.fire('change'); ed.save && ed.save(); };
    }
    const $ = window.jQuery;
    if ($ && $.fn && $.fn.summernote && el.nextElementSibling && el.nextElementSibling.classList.contains('note-editor')) {
      return (h) => $(el).summernote('code', h);
    }
    return null;
  }

  function setEditable(el, html) {
    const doc = el.ownerDocument;
    if (el.ckeditorInstance && el.ckeditorInstance.setData) { el.ckeditorInstance.setData(html); return; }
    const qc = el.classList.contains('ql-editor') && el.parentElement;
    const quill = qc && (qc.__quill || (window.Quill && Quill.find && Quill.find(qc)));
    if (quill && quill.clipboard) { quill.setText(''); quill.clipboard.dangerouslyPasteHTML(0, html); return; }
    if (el.classList.contains('note-editable') && window.jQuery) {
      const ta = el.closest('.note-editor') && el.closest('.note-editor').previousElementSibling;
      if (ta && window.jQuery.fn.summernote) { window.jQuery(ta).summernote('code', html); return; }
    }
    el.focus();
    let ok = false;
    try {
      const sel = doc.getSelection();
      const range = doc.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges(); sel.addRange(range);
      ok = doc.execCommand('insertHTML', false, html);
    } catch (e) { ok = false; }
    if (!ok || !el.textContent.trim()) {
      el.innerHTML = html;
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
  }

  function setAny(el, value, isHtml) {
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      const ed = editorFor(el);
      if (ed) { ed(isHtml ? value : escapeHtml(value)); return; }
      setValue(el, value);
      return;
    }
    if (tag === 'IFRAME') {
      const b = el.contentDocument && el.contentDocument.body;
      if (b) setEditable(b, isHtml ? value : escapeHtml(value));
      return;
    }
    setEditable(el, isHtml ? value : escapeHtml(value));
  }
  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function findInput(kind) {
    const els = [...document.querySelectorAll('input[type=text], input:not([type]), textarea')]
      .filter((el) => !el.disabled && !el.readOnly && (visible(el) || editorFor(el)));
    const hits = els.filter((el) => { const d = describe(el); return PAT[kind].test(d) && !NOT.test(d); });
    return hits[0] || null;
  }

  // ---- Tiêu đề, sapo ----
  const used = new Set();
  for (const kind of ['title', 'sapo']) {
    const value = data[kind];
    if (!value) { out[kind] = null; continue; }
    const el = resolve(map[kind]) || findInput(kind);
    if (el) { setAny(el, value, false); used.add(el); out[kind] = true; }
  }

  // ---- Nội dung ----
  function fillBody(html) {
    const mapped = resolve(map.body);
    if (mapped) { setAny(mapped, html, true); return true; }

    const pick = (list, nameOf, sizeOf) => {
      const ok = list.filter((x) => !PAT.sapo.test(norm(nameOf(x))) || PAT.body.test(norm(nameOf(x))));
      const pool = ok.length ? ok : list;
      return pool.find((x) => PAT.body.test(norm(nameOf(x)))) || pool.sort((a, b) => sizeOf(b) - sizeOf(a))[0];
    };

    if (window.CKEDITOR && CKEDITOR.instances && Object.keys(CKEDITOR.instances).length) {
      const ed = pick(Object.values(CKEDITOR.instances), (e) => e.name, (e) => (e.container && e.container.$ ? area(e.container.$) : 0));
      ed.setData(html); return true;
    }
    if (window.tinymce) {
      const list = (tinymce.get && Array.isArray(tinymce.get()) ? tinymce.get() : tinymce.editors) || [];
      if (list.length) {
        const ed = pick([...list], (e) => e.id, (e) => (e.getContainer && e.getContainer() ? area(e.getContainer()) : 0));
        ed.setContent(html); ed.fire && ed.fire('change'); ed.save && ed.save(); return true;
      }
    }
    const editables = [...document.querySelectorAll('.ck-editor__editable, .ql-editor, .note-editable, .fr-element, .ProseMirror, [contenteditable="true"], [contenteditable=""]')]
      .filter((el) => visible(el) && !used.has(el) && !el.parentElement.closest('[contenteditable="true"], [contenteditable=""]'));
    if (editables.length) {
      setEditable(editables.sort((a, b) => area(b) - area(a))[0], html); return true;
    }
    const frames = [...document.querySelectorAll('iframe')].filter((f) => {
      try { const d = f.contentDocument; return d && d.body && visible(f) && (d.designMode === 'on' || d.body.isContentEditable); } catch (e) { return false; }
    });
    if (frames.length) {
      setEditable(frames.sort((a, b) => area(b) - area(a))[0].contentDocument.body, html); return true;
    }
    const ta = [...document.querySelectorAll('textarea')]
      .filter((el) => visible(el) && !used.has(el) && !el.disabled && !el.readOnly)
      .filter((el) => PAT.body.test(describe(el)))[0];
    if (ta) { setValue(ta, html); return true; }
    return false;
  }
  try { out.body = fillBody(data.html); } catch (e) { out.notes.push('Lỗi khi điền nội dung: ' + e.message); }

  // ---- Tác giả, nguồn: chỉ điền khi đã chỉ định ô ----
  for (const [kind, value] of [['author', data.author], ['source', data.site]]) {
    const el = resolve(map[kind]);
    if (el && value) { setAny(el, value, false); out[kind] = true; }
  }

  // ---- Nút gửi duyệt ----
  if (autoSubmit) {
    const btn = resolve(map.submit);
    if (!btn) out.submit = false;
    else if (out.title && out.body) { setTimeout(() => btn.click(), 600); out.submit = true; }
    else { out.submit = false; out.notes.push('Chưa điền đủ tiêu đề và nội dung nên không tự gửi duyệt.'); }
  }
  return out;
}
