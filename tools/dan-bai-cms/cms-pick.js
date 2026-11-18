// Chạy trong trang CMS để người dùng bấm chọn một ô. Lưu tên ô trên form (ví dụ «Tiêu đề (Tiếng Việt)»)
// và vị trí dự phòng tính từ <body>, để không khớp nhầm ô ở trang khác.
// eslint-disable-next-line no-unused-vars
function danBaiPick(field, prompt) {
  if (window.__danBaiPickCleanup) window.__danBaiPickCleanup();

  const unique = (doc, sel) => { try { return doc.querySelectorAll(sel).length === 1; } catch (e) { return false; } };
  const stableId = (id) => id && !/\d{3,}|^(ember|react|radix|headlessui|tiny|:r)/i.test(id);
  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();

  function selectorFor(el) {
    const doc = el.ownerDocument;
    const parts = [];
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      if (node === doc.body) return ['body', ...parts].join(' > ');
      const tag = node.tagName.toLowerCase();
      if (stableId(node.id) && unique(doc, '#' + CSS.escape(node.id))) return ['#' + CSS.escape(node.id), ...parts].join(' > ');
      const name = node.getAttribute('name');
      if (name && unique(doc, `${tag}[name="${CSS.escape(name)}"]`)) return [`${tag}[name="${CSS.escape(name)}"]`, ...parts].join(' > ');
      const same = [...node.parentElement.children].filter((c) => c.tagName === node.tagName);
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
    }
    return parts.join(' > ');
  }

  const docs = [{ doc: document, frame: null }];
  document.querySelectorAll('iframe').forEach((f) => {
    try { if (f.contentDocument && f.contentDocument.body) docs.push({ doc: f.contentDocument, frame: f }); } catch (e) { /* khung khác nguồn */ }
  });

  const bar = document.createElement('div');
  bar.textContent = `Bấm vào ${prompt} trên trang này. Nhấn Esc để hủy.`;
  bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:2147483647;pointer-events:none;padding:10px 16px;background:#a61b1b;color:#fff;font:600 15px system-ui,sans-serif;text-align:center;box-shadow:0 -2px 8px rgba(0,0,0,.3)';
  document.documentElement.appendChild(bar);

  let hot = null; let hotOutline = '';
  const unmark = () => { if (hot) { hot.style.outline = hotOutline; hot = null; } };

  const fieldOf = (entry, el) => (entry.frame || el).closest('.field');

  function labelOf(entry, el) {
    const f = fieldOf(entry, el);
    if (f) { const fn = f.querySelector('.field-name') || f.querySelector('.field-label'); if (fn) return clean(fn.textContent); }
    if (el.id) { const l = el.ownerDocument.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) return clean(l.textContent); }
    return '';
  }

  function target(entry, el) {
    if (field === 'submit') return el.closest('button, a, [role=button], .v-button') || el;
    const f = fieldOf(entry, el);
    if (f) return f.querySelector('.interface') || f;
    const doc = el.ownerDocument;
    if (doc.designMode === 'on' || doc.body.isContentEditable) return doc.body;
    return el.closest('[contenteditable="true"], [contenteditable=""], textarea, input') || el;
  }

  const handlers = docs.map((entry) => {
    const over = (e) => {
      if (e.target === bar) return;
      unmark(); hot = target(entry, e.target); hotOutline = hot.style.outline; hot.style.outline = '3px solid #a61b1b';
    };
    const click = (e) => {
      if (e.target === bar) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      const t = target(entry, e.target);
      const inFrame = t.ownerDocument !== document;
      const value = {
        label: labelOf(entry, e.target),
        selector: selectorFor(t),
        frame: inFrame ? selectorFor(entry.frame) : null,
      };
      cleanup(true);
      chrome.storage.local.get({ map2: {} }, ({ map2 }) => {
        map2[field] = value;
        chrome.storage.local.set({ map2 }, () => {
          bar.textContent = `Đã ghi nhớ ${prompt}. Đang quay lại công cụ…`;
          bar.style.background = '#1b6e2d';
          setTimeout(() => bar.remove(), 1500);
          chrome.runtime.sendMessage({ type: 'picked', field });
        });
      });
    };
    const key = (e) => { if (e.key === 'Escape') cleanup(); };
    entry.doc.addEventListener('mouseover', over, true);
    entry.doc.addEventListener('click', click, true);
    entry.doc.addEventListener('keydown', key, true);
    return { entry, over, click, key };
  });

  function cleanup(keepBar) {
    unmark();
    handlers.forEach(({ entry, over, click, key }) => {
      entry.doc.removeEventListener('mouseover', over, true);
      entry.doc.removeEventListener('click', click, true);
      entry.doc.removeEventListener('keydown', key, true);
    });
    if (!keepBar) bar.remove();
    window.__danBaiPickCleanup = null;
  }
  window.__danBaiPickCleanup = cleanup;
}
