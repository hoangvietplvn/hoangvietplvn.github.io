// Cầu nối cho bản Android (APK). Trong tiện ích Chrome file này không làm gì.
// Thay các API chrome.* (lưu trữ, tab, chèn mã vào trang CMS) và fetch bằng cầu nối gốc của ứng dụng (window.DanBaiNative).
// Mã gốc của tiện ích (app.js, extract.js, cms-fill.js) được giữ nguyên.
(function () {
  if (window.chrome && chrome.storage && chrome.storage.local) return; // tiện ích Chrome
  const N = window.DanBaiNative;
  if (!N) return;
  document.documentElement.classList.add('android');
  // Thông báo điền CMS hiện trên thanh của màn hình CMS.
  window.__barHook = (t) => { try { N.setBar(String(t || '')); } catch (e) { /* bỏ qua */ } };

  // ---- Gọi cầu nối gốc và nhận kết quả ----
  const pending = new Map();
  let seq = 0;
  window.__natCb = (id, payload) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (payload && payload.error) p.rej(new Error(payload.error));
    else p.res(payload || {});
  };
  const call = (fn, ...args) => new Promise((res, rej) => {
    const id = 'c' + (++seq);
    pending.set(id, { res, rej });
    try { N[fn](id, ...args); } catch (e) { pending.delete(id); rej(e); }
  });

  // ---- Lưu trữ (localStorage) ----
  const KEY = 'dbc:';
  const readKey = (k) => { try { const v = localStorage.getItem(KEY + k); return v === null ? undefined : JSON.parse(v); } catch (e) { return undefined; } };
  const local = {
    get(defaults) {
      const out = {};
      const isObj = defaults && typeof defaults === 'object' && !Array.isArray(defaults);
      const keys = typeof defaults === 'string' ? [defaults] : Array.isArray(defaults) ? defaults : Object.keys(defaults || {});
      for (const k of keys) {
        const v = readKey(k);
        out[k] = v === undefined ? (isObj ? defaults[k] : undefined) : v;
      }
      return Promise.resolve(out);
    },
    set(obj) {
      for (const k of Object.keys(obj || {})) { try { localStorage.setItem(KEY + k, JSON.stringify(obj[k])); } catch (e) { /* bỏ qua */ } }
      return Promise.resolve();
    },
  };

  // ---- Tab CMS: chỉ có một tab, là màn hình CMS trong ứng dụng ----
  const TAB_ID = 1;
  const defaultCms = 'https://cms.phapluat.gov.vn/admin/content-articles/review';
  const cmsSetting = () => readKey('cmsUrl2') || defaultCms;
  const cmsOrigin = () => { try { return new URL(cmsSetting()).origin; } catch (e) { return new URL(defaultCms).origin; } };
  let cmsUrl = '';
  let cmsReady = false;
  const listeners = [];
  const tab = () => ({ id: TAB_ID, url: cmsUrl, status: cmsReady ? 'complete' : 'loading', windowId: 1, lastAccessed: Date.now() });
  // Ứng dụng gọi hàm này khi trang CMS tải xong.
  window.__cmsEvent = (ev) => {
    if (ev === 'loaded') {
      cmsReady = true;
      for (const f of listeners.slice()) { try { f(TAB_ID, { status: 'complete' }, tab()); } catch (e) { /* bỏ qua */ } }
    }
  };

  const tabs = {
    query: async () => (cmsUrl && cmsReady ? [tab()] : []),
    create: async (props) => {
      const url = props && props.url;
      if (!url) throw new Error('Thiếu địa chỉ trang');
      let origin = ''; try { origin = new URL(url).origin; } catch (e) { /* bỏ qua */ }
      if (origin !== cmsOrigin()) throw new Error('Trên điện thoại không mở trang khác ở nền; hãy dùng link đã dán');
      cmsUrl = url;
      await call('showCms', url);
      return tab();
    },
    update: async (id, props) => {
      if (props && props.active) await call('showCms', cmsUrl || cmsSetting());
      return tab();
    },
    get: async () => tab(),
    remove: async () => {},
    getCurrent: async () => null,
    onUpdated: {
      addListener: (f) => listeners.push(f),
      removeListener: (f) => { const i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); },
    },
  };

  // ---- Chèn mã vào trang CMS ----
  // Trang CMS phải hiện (có kích thước) thì mới tìm được nút và ô; hiện trước khi chèn mã, chờ bố cục xong.
  let cmsShown = false;
  const ensureCmsShown = async () => {
    await call('showCms', cmsUrl || cmsSetting());
    if (!cmsShown) { cmsShown = true; await new Promise((r) => setTimeout(r, 600)); }
  };
  const scripting = {
    executeScript: async (opts) => {
      await ensureCmsShown();
      if (opts.files) {
        for (const f of opts.files) await call('cmsEvalAsset', f);
        return [{ result: null }];
      }
      if (opts.func) {
        const r = await call('cmsRun', '(' + opts.func.toString() + ')', JSON.stringify(opts.args || []));
        return [{ result: r.result === undefined ? null : r.result }];
      }
      return [];
    },
  };

  // ---- Tải dữ liệu qua mã gốc (không bị chặn truy cập chéo domain) ----
  const origFetch = window.fetch.bind(window);
  const CHUNK = 512 * 1024;
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!/^https?:\/\//i.test(url)) return origFetch(input, init);
    const meta = await call('fetchBytes', url);
    if (meta.status === undefined) throw new Error('Không tải được: ' + url);
    const parts = [];
    for (let off = 0; off < meta.size; off += CHUNK) {
      const b64 = N.getChunk(meta.id, off, Math.min(CHUNK, meta.size - off));
      const bin = atob(b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      parts.push(u8);
    }
    N.release(meta.id);
    const res = new Response(new Blob(parts, { type: meta.type || 'application/octet-stream' }), {
      status: meta.status || 200,
      headers: { 'content-type': meta.type || '' },
    });
    Object.defineProperty(res, 'url', { value: meta.url || url });
    return res;
  };

  window.chrome = {
    storage: { local, onChanged: { addListener() {}, removeListener() {} } },
    tabs,
    windows: { update: async () => ({}) },
    scripting,
    runtime: { sendMessage: () => Promise.resolve(), onMessage: { addListener() {}, removeListener() {} }, getURL: (p) => p },
  };
})();
