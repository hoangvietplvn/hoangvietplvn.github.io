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

  // ---- Tab CMS ----
  // Ứng dụng có hai màn hình CMS, coi như hai tab: 1 = CMS PLQG, 2 = CMS Moj.
  // Cửa sổ kho ảnh mà CMS Moj mở ra (khi bấm «Chọn ảnh mới») là một tab tạm, mã từ 3 trở lên.
  const DEF = { 1: 'https://cms.phapluat.gov.vn/admin/content-articles/review', 2: 'https://moj.gov.vn/cms/nghiep-vu/quan-ly-tin-tuc/chinh-sua-bai-viet' };
  const SET = { 1: 'cmsUrl2', 2: 'mojUrl' };
  const setting = (w) => readKey(SET[w]) || DEF[w];
  const originOf = (u) => { try { return new URL(u).origin; } catch (e) { return ''; } };
  const state = { 1: { url: '', ready: false }, 2: { url: '', ready: false } };
  let popup = null; // { id, url, ready }
  const listeners = [];
  const tabObj = (id) => {
    if (state[id]) return { id, url: state[id].url, status: state[id].ready ? 'complete' : 'loading', windowId: 1, lastAccessed: Date.now() };
    if (popup && popup.id === id) return { id, url: popup.url, status: popup.ready ? 'complete' : 'loading', windowId: 1, openerTabId: 2, lastAccessed: Date.now() };
    return null;
  };
  // Màn hình (1, 2, hoặc 3 = cửa sổ kho ảnh) ứng với một mã tab.
  const viewOf = (id) => {
    if (state[id]) return id;
    if (popup && popup.id === id) return 3;
    throw new Error('Cửa sổ đã đóng');
  };
  // Ứng dụng gọi hàm này khi một trang CMS tải xong, đổi địa chỉ, hoặc cửa sổ kho ảnh mở/đóng.
  window.__cmsEvent = (ev, id, url) => {
    if (ev === 'popup-open') { popup = { id, url: url || '', ready: false }; return; }
    if (ev === 'popup-closed') { if (popup && popup.id === id) popup = null; return; }
    const t = state[id] || (popup && popup.id === id ? popup : null);
    if (!t) return;
    if (url) t.url = url;
    if (ev === 'loaded') {
      t.ready = true;
      for (const f of listeners.slice()) { try { f(id, { status: 'complete' }, tabObj(id)); } catch (e) { /* bỏ qua */ } }
    }
  };

  const tabs = {
    query: async () => {
      // Hỏi lại địa chỉ hiện tại của từng trang CMS (trang một-trang đổi địa chỉ mà không tải lại, ví dụ sau khi lưu bài).
      for (const w of [1, 2]) {
        if (!state[w].url || !state[w].ready) continue;
        try {
          const r = await Promise.race([call('cmsRun', w, '(() => location.href)', '[]'), new Promise((res) => setTimeout(() => res(null), 1500))]);
          if (r && typeof r.result === 'string' && /^https?:/.test(r.result)) state[w].url = r.result;
        } catch (e) { /* giữ địa chỉ đã biết */ }
      }
      return [1, 2].filter((w) => state[w].url && state[w].ready).map(tabObj).concat(popup ? [tabObj(popup.id)] : []);
    },
    create: async (props) => {
      const url = props && props.url;
      if (!url) throw new Error('Thiếu địa chỉ trang');
      const o = originOf(url);
      const w = o && o === originOf(setting(2)) ? 2 : o && o === originOf(setting(1)) ? 1 : 0;
      if (!w) throw new Error('Trên điện thoại không mở trang khác ở nền; hãy dùng link đã dán');
      state[w].url = url; state[w].ready = false;
      await call('loadCms', w, url);
      return tabObj(w);
    },
    update: async (id, props) => {
      if (props && props.active) await call('showTab', viewOf(id) === 1 ? 1 : 2);
      return tabObj(id);
    },
    get: async (id) => {
      const t = tabObj(id);
      if (!t) throw new Error('Cửa sổ đã đóng');
      return t;
    },
    reload: async (id) => {
      if (!state[id]) return;
      state[id].ready = false;
      await call('reloadCms', id);
    },
    remove: async () => {},
    getCurrent: async () => null,
    onUpdated: {
      addListener: (f) => listeners.push(f),
      removeListener: (f) => { const i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); },
    },
  };

  // ---- Chèn mã vào trang CMS ----
  // Trang CMS phải hiện (có kích thước) thì mới tìm được nút và ô; hiện trước khi chèn mã, chờ bố cục xong.
  let lastShown = 0;
  const ensureShown = async (view) => {
    const w = view === 1 ? 1 : 2;
    await call('showTab', w);
    if (lastShown !== w) { lastShown = w; await new Promise((r) => setTimeout(r, 600)); }
  };
  const scripting = {
    executeScript: async (opts) => {
      const view = viewOf(opts.target && opts.target.tabId);
      await ensureShown(view);
      if (opts.files) {
        for (const f of opts.files) await call('cmsEvalAsset', view, f);
        return [{ result: null }];
      }
      if (opts.func) {
        const r = await call('cmsRun', view, '(' + opts.func.toString() + ')', JSON.stringify(opts.args || []));
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

  // ---- Kho ảnh: ảnh lưu trong bộ nhớ riêng của ứng dụng (không cần quyền truy cập thư viện) ----
  const CHUNK64 = 3 * 170000; // bội số của 3 để nối chuỗi base64 đúng
  window.DanBaiStore = {
    list() { try { return JSON.parse(N.storeList() || '[]'); } catch (e) { return []; } },
    findBySource(src) { return window.DanBaiStore.list().find((x) => x.source === src) || null; },
    add(name, mime, b64, source) { return N.storeAdd(name, mime, b64, source || ''); },
    readB64(id) {
      const size = N.storeSize(id);
      let out = '';
      for (let off = 0; off < size; off += CHUNK64) out += N.storeGetChunk(id, off, Math.min(CHUNK64, size - off));
      return out;
    },
    remove(id) { N.storeDelete(id); },
    clear() { N.storeClear(); },
  };

  window.chrome = {
    storage: { local, onChanged: { addListener() {}, removeListener() {} } },
    tabs,
    windows: { update: async () => ({}) },
    scripting,
    runtime: { sendMessage: () => Promise.resolve(), onMessage: { addListener() {}, removeListener() {} }, getURL: (p) => p },
  };
})();
