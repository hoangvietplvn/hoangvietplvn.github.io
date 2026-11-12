// Chạy trong trang CMS để người dùng bấm chọn một ô nhập; lưu lại bộ chọn (selector) của ô đó.
// eslint-disable-next-line no-unused-vars
function danBaiPick(field, label) {
  if (window.__danBaiPickCleanup) window.__danBaiPickCleanup();

  const unique = (doc, sel) => { try { return doc.querySelectorAll(sel).length === 1; } catch (e) { return false; } };
  const stableId = (id) => id && !/\d{3,}|^(ember|react|radix|headlessui|tiny|:r)/i.test(id);

  function selectorFor(el) {
    const doc = el.ownerDocument;
    if (el === doc.body) return 'body';
    const parts = [];
    for (let node = el; node && node !== doc.body && node.nodeType === 1; node = node.parentElement) {
      const tag = node.tagName.toLowerCase();
      if (stableId(node.id) && unique(doc, '#' + CSS.escape(node.id))) { parts.unshift('#' + CSS.escape(node.id)); break; }
      const name = node.getAttribute('name');
      if (name && unique(doc, `${tag}[name="${CSS.escape(name)}"]`)) { parts.unshift(`${tag}[name="${CSS.escape(name)}"]`); break; }
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
  bar.textContent = `Bấm vào ${label} trên trang này. Nhấn Esc để hủy.`;
  bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:2147483647;pointer-events:none;padding:10px 16px;background:#a61b1b;color:#fff;font:600 15px system-ui,sans-serif;text-align:center;box-shadow:0 -2px 8px rgba(0,0,0,.3)';
  document.documentElement.appendChild(bar);

  let hot = null; let hotOutline = '';
  const unmark = () => { if (hot) { hot.style.outline = hotOutline; hot = null; } };

  function target(el) {
    const doc = el.ownerDocument;
    if (field === 'submit' || field === 'category' || field === 'date') return (field !== 'submit' && el.closest('input, select')) || el.closest('button, a, input[type=submit], input[type=button], [role=button], .v-button, .v-select') || el;
    if (doc.designMode === 'on' || doc.body.isContentEditable) return doc.body;
    return el.closest('[contenteditable="true"], [contenteditable=""], textarea, input') || el;
  }
  const onOver = (e) => {
    if (e.target === bar) return;
    unmark(); hot = target(e.target); hotOutline = hot.style.outline; hot.style.outline = '3px solid #a61b1b';
  };
  const onKey = (e) => { if (e.key === 'Escape') { cleanup(); } };

  function onClick(entry, e) {
    if (e.target === bar) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    const el = target(e.target);
    const value = { selector: selectorFor(el), frame: entry.frame ? selectorFor(entry.frame) : null };
    cleanup(true);
    chrome.storage.local.get({ map2: {} }, ({ map2 }) => {
      map2[field] = value;
      chrome.storage.local.set({ map2 }, () => {
        bar.textContent = `Đã ghi nhớ ${label}. Đang quay lại công cụ…`;
        bar.style.background = '#1b6e2d';
        setTimeout(() => bar.remove(), 1500);
        chrome.runtime.sendMessage({ type: 'picked', field });
      });
    });
  }

  const handlers = docs.map((entry) => {
    const click = (e) => onClick(entry, e);
    entry.doc.addEventListener('mouseover', onOver, true);
    entry.doc.addEventListener('click', click, true);
    entry.doc.addEventListener('keydown', onKey, true);
    return { entry, click };
  });

  function cleanup(keepBar) {
    unmark();
    handlers.forEach(({ entry, click }) => {
      entry.doc.removeEventListener('mouseover', onOver, true);
      entry.doc.removeEventListener('click', click, true);
      entry.doc.removeEventListener('keydown', onKey, true);
    });
    if (!keepBar) bar.remove();
    window.__danBaiPickCleanup = null;
  }
  window.__danBaiPickCleanup = cleanup;
}
