// Bản web (trang cài trên GitHub Pages, dùng được trên điện thoại và máy tính).
// Trang web không điều khiển được tab CMS khác, nên các lệnh chrome.tabs / chrome.scripting bị thay bằng «chuyển giao»:
// bài được sao chép vào bộ nhớ tạm, rồi dấu trang «Dán bài» chạy ngay trên trang CMS (nơi bạn đã đăng nhập) để điền.
// Mật khẩu CMS không bao giờ đi qua trang này.
(function () {
  if (window.chrome && chrome.storage && chrome.storage.local) return; // tiện ích Chrome
  if (window.DanBaiNative) return; // ứng dụng Android
  document.documentElement.classList.add('web');
  const $ = (id) => document.getElementById(id);

  // ---- Lưu trữ (localStorage) ----
  const KEY = 'dbc:';
  const readKey = (k) => { try { const v = localStorage.getItem(KEY + k); return v === null ? undefined : JSON.parse(v); } catch (e) { return undefined; } };
  const writeKey = (k, v) => { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } };
  const local = {
    get(defaults) {
      const out = {};
      const isObj = defaults && typeof defaults === 'object' && !Array.isArray(defaults);
      const keys = typeof defaults === 'string' ? [defaults] : Array.isArray(defaults) ? defaults : Object.keys(defaults || {});
      for (const k of keys) { const v = readKey(k); out[k] = v === undefined ? (isObj ? defaults[k] : undefined) : v; }
      return Promise.resolve(out);
    },
    set(obj) { for (const k of Object.keys(obj || {})) writeKey(k, obj[k]); return Promise.resolve(); },
  };
  const no = () => Promise.reject(new Error('Bản web không điều khiển được tab khác'));
  window.chrome = {
    storage: { local, onChanged: { addListener() {}, removeListener() {} } },
    tabs: { query: async () => [], create: no, update: no, get: no, reload: no, remove: no, getCurrent: async () => null, onUpdated: { addListener() {}, removeListener() {} } },
    windows: { update: async () => ({}) },
    scripting: { executeScript: no },
    runtime: { sendMessage: () => Promise.resolve(), onMessage: { addListener() {}, removeListener() {} }, getURL: (p) => p },
  };

  // ---- Máy chủ lấy bài (proxy) ----
  // Trình duyệt chặn trang web đọc trực tiếp trang báo khác. Cần một máy chủ trung gian nhỏ (web/worker/proxy.js, chạy miễn phí trên Cloudflare).
  const proxyUrl = () => String(readKey('proxy') || '').trim().replace(/\/+$/, '');
  const proxyKey = () => String(readKey('proxyKey') || '').trim();
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!/^https?:\/\//i.test(url) || new URL(url).origin === location.origin) return origFetch(input, init);
    const p = proxyUrl();
    if (!p) throw new Error('chưa cài «Máy chủ lấy bài» trong Thiết lập; hoặc dùng ô «Dán nội dung» bên dưới');
    const q = `${p}?url=${encodeURIComponent(url)}` + (proxyKey() ? `&key=${encodeURIComponent(proxyKey())}` : '');
    let res;
    try { res = await origFetch(q, { credentials: 'omit', redirect: 'follow' }); } catch (e) { throw new Error('không kết nối được máy chủ lấy bài'); }
    const finalUrl = res.headers.get('x-final-url') || url;
    Object.defineProperty(res, 'url', { value: finalUrl });
    return res;
  };

  // ---- Chuyển bài sang dấu trang ----
  const MARK = 'DANBAI1\n';
  const CMS_URL = { plq: () => readKey('cmsUrl2') || 'https://cms.phapluat.gov.vn/admin/content-articles/review', moj: () => readKey('mojUrl') || 'https://moj.gov.vn/cms/nghiep-vu/quan-ly-tin-tuc/chinh-sua-bai-viet' };
  const NAME = { plq: 'CMS PLQG', moj: 'CMS Moj' };
  const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
  let lastText = '';

  async function handoff(kind, payload, st) {
    lastText = MARK + JSON.stringify({ v: 1, kind, ts: Date.now(), ...payload });
    const box = $('handoff');
    box.hidden = false;
    $('handoff-title').textContent = `Bài đã sẵn sàng cho ${NAME[kind]} (${mb(lastText.length)})`;
    const open = $('handoff-open');
    open.href = CMS_URL[kind](); open.textContent = `Mở ${NAME[kind]}`;
    let copied = false;
    try { await navigator.clipboard.writeText(lastText); copied = true; } catch (e) { /* iPhone/Safari: cần bấm nút Sao chép */ }
    $('handoff-state').textContent = copied
      ? 'Đã sao chép bài vào bộ nhớ tạm.'
      : 'Trình duyệt chưa cho tự sao chép: bấm nút «Sao chép bài» bên dưới.';
    $('handoff-steps').textContent = kind === 'moj'
      ? 'Tiếp theo: mở CMS Moj, vào trang «Thêm mới tin bài» (đã đăng nhập), rồi bấm dấu trang «Dán bài». Nếu có ảnh đại diện: bấm «Chọn ảnh mới» trên CMS, khi cửa sổ kho ảnh hiện ra thì bấm dấu trang «Dán bài» lần nữa.'
      : 'Tiếp theo: mở CMS PLQG (đã đăng nhập), vào trang quản lý bài viết, rồi bấm dấu trang «Dán bài».';
    st.textContent = '';
    st.className = 'status';
    box.scrollIntoView({ block: 'nearest' });
  }
  window.DanBaiWeb = { handoff };

  // ---- Giao diện bổ sung (chèn bằng mã để app.html dùng chung với tiện ích) ----
  const bmCode = () => `javascript:(function(){var s=document.createElement('script');s.src='${location.origin}${location.pathname.replace(/[^/]*$/, '')}runner.js?'+Date.now();s.onerror=function(){alert('Không tải được mã Dán bài. CMS có thể chặn mã từ bên ngoài.')};document.head.appendChild(s)})();`;
  function build() {
    const main = document.querySelector('main');
    const h1 = main.querySelector('h1');
    const hand = document.createElement('section');
    hand.id = 'handoff'; hand.hidden = true; hand.className = 'handoff';
    hand.innerHTML = '<h2 id="handoff-title"></h2><p id="handoff-state" class="status"></p><p id="handoff-steps" class="hint"></p>'
      + '<div class="row"><button id="handoff-copy" type="button" class="primary">Sao chép bài</button><a id="handoff-open" class="btn" target="_blank" rel="noopener"></a></div>';
    main.querySelector('#article').after(hand);
    hand.querySelector('#handoff-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(lastText); $('handoff-state').textContent = 'Đã sao chép bài vào bộ nhớ tạm.'; }
      catch (e) { $('handoff-state').textContent = 'Không sao chép được. Hãy bấm giữ vào ô bên dưới, chọn tất cả rồi sao chép.'; $('handoff-raw').hidden = false; $('handoff-raw').value = lastText; }
    });
    const raw = document.createElement('textarea'); raw.id = 'handoff-raw'; raw.hidden = true; raw.rows = 4; raw.readOnly = true;
    hand.append(raw);

    const intro = document.createElement('details');
    intro.id = 'web-setup'; intro.open = !readKey('setupDone');
    intro.innerHTML = '<summary>Cài đặt lần đầu (dấu trang «Dán bài» và máy chủ lấy bài)</summary>'
      + '<h2>1. Dấu trang «Dán bài»</h2>'
      + '<p class="hint">Dấu trang chạy trên trang CMS mà bạn đã đăng nhập, lấy bài từ bộ nhớ tạm và điền vào form. Mật khẩu CMS ở lại trong trình duyệt của bạn, không đi qua nơi nào khác.</p>'
      + '<p><a id="bm-link" class="btn" href="#">Dán bài</a> <span class="hint">Máy tính: kéo nút này lên thanh dấu trang.</span></p>'
      + '<p><button id="bm-copy" type="button">Sao chép mã dấu trang</button> <span class="hint">Điện thoại: tạo một dấu trang bất kỳ, sửa tên thành «Dán bài», dán mã này vào ô địa chỉ. Khi dùng, mở CMS rồi gõ «Dán bài» vào thanh địa chỉ và chọn dấu trang (Chrome Android), hoặc mở danh sách dấu trang (Safari iPhone).</span></p>'
      + '<h2>2. Máy chủ lấy bài (để dán link báo)</h2>'
      + '<p class="hint">Trình duyệt không cho trang web tự đọc trang báo khác, nên cần một máy chủ trung gian miễn phí (xem <code>web/README.md</code>). Chưa có thì vẫn dùng được bằng cách dán nội dung vào ô «Dán nội dung» ở trên.</p>'
      + '<label>Địa chỉ máy chủ lấy bài <input id="s-proxy" type="url" placeholder="https://ten.workers.dev"></label>'
      + '<label>Khóa (nếu có đặt) <input id="s-proxykey" type="text" autocomplete="off"></label>'
      + '<p><button id="web-done" type="button">Đã cài xong, thu gọn mục này</button></p>';
    main.append(intro);
    $('bm-link').href = bmCode();
    $('bm-link').addEventListener('click', (e) => e.preventDefault());
    $('bm-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(bmCode()); $('bm-copy').textContent = 'Đã sao chép'; } catch (e) { prompt('Sao chép mã này:', bmCode()); }
    });
    $('s-proxy').value = proxyUrl(); $('s-proxykey').value = proxyKey();
    $('s-proxy').addEventListener('change', () => writeKey('proxy', $('s-proxy').value.trim()));
    $('s-proxykey').addEventListener('change', () => writeKey('proxyKey', $('s-proxykey').value.trim()));
    $('web-done').addEventListener('click', () => { writeKey('setupDone', true); intro.open = false; });

    const paste = document.createElement('details');
    paste.id = 'paste-box';
    paste.innerHTML = '<summary>Dán nội dung (khi không có máy chủ lấy bài, hoặc bài ở Word / Google Docs)</summary>'
      + '<p class="hint">Mở bài gốc, chọn hết rồi sao chép, dán vào khung dưới. Dòng đầu là tiêu đề, đoạn ngắn kế tiếp là sapo. Ảnh dán kèm không giữ được; ảnh đại diện có thể nhập bằng link ở form bên dưới.</p>'
      + '<div id="paste-area" class="body" contenteditable="true"></div>'
      + '<p><button id="paste-go" type="button" class="primary">Dùng nội dung này</button> <span id="paste-msg" class="hint"></span></p>';
    h1.after(paste);
    $('paste-go').addEventListener('click', () => {
      const html = $('paste-area').innerHTML.trim();
      if (!html) { $('paste-msg').textContent = 'Chưa có nội dung.'; return; }
      try {
        const art = window.DanBai.docFromHtml('<html><body>' + html + '</body></html>', '');
        art.fromDoc = false; art.url = art.url || location.href;
        window.DanBaiShowArticle(art);
        $('paste-msg').textContent = 'Đã đưa lên form bên dưới.';
        $('article').scrollIntoView({ behavior: 'smooth' });
      } catch (e) { $('paste-msg').textContent = 'Không đọc được: ' + e.message; }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
