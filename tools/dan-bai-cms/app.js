/* global DanBai, fetchImageFile, danBaiFill, danBaiPick, danBaiDiag, mojFill, mojCoverState, mojClickCover, mojAfterCover, mojSave, mojMediaUpload, mojMediaChoose, mojBanner, mojDiag */
// Một công cụ cho hai CMS:
//   PLQG = CMS Cổng Pháp luật quốc gia (cms.phapluat.gov.vn, Directus)      → cms-fill.js, cms-pick.js
//   Moj  = CMS Cổng thông tin điện tử Bộ Tư pháp (moj.gov.vn/cms, Fluent UI) → moj-cms.js
const $ = (id) => document.getElementById(id);
const DEFAULT_CMS = 'https://cms.phapluat.gov.vn/admin/content-articles/review';
const DEFAULT_MOJ = 'https://moj.gov.vn/cms/nghiep-vu/quan-ly-tin-tuc/chinh-sua-bai-viet';
const MEDIA_RE = /^https?:\/\/portalmedia\./i;
const FIELDS = [
  ['title', 'ô Tiêu đề'],
  ['sapo', 'ô Tóm tắt'],
  ['body', 'ô Nội dung'],
  ['author', 'ô Tác giả'],
  ['date', 'ô Ngày đăng'],
  ['category', 'ô Danh mục'],
  ['submit', 'nút Lưu hoặc Gửi phê duyệt'],
];

// PLQG: cmsUrl2, map2 (chỉ định ô), autoSubmit, setDate, importCover, category. Moj: các khóa có tiền tố moj.
let settings = {
  cmsUrl2: DEFAULT_CMS, map2: {}, autoSubmit: false, setDate: true, importCover: true, credit: false, category: 'Tin hoạt động',
  mojUrl: DEFAULT_MOJ, mojAutoSave: false, mojImportCover: true, mojCategory: '',
};
let article = null;

function setStatus(el, text, kind) {
  el.textContent = text; el.className = 'status' + (kind ? ' ' + kind : '');
  // Bản Android: đưa thông báo điền CMS lên thanh trên màn hình CMS (để thấy khi đang ở CMS).
  if (el.id === 'fill-status' && window.__barHook) window.__barHook(text);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function poll(fn, ms, step = 400) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await sleep(step);
  }
}
function lockFill(on) { $('fill-plq').disabled = on; $('fill-moj').disabled = on; }

// ---------- Thiết lập ----------
async function loadSettings() {
  settings = await chrome.storage.local.get(settings);
  // Bộ chọn cũ (không có tên ô) có thể trỏ nhầm sang ô khác; bỏ đi để chỉ định lại.
  const kept = {};
  for (const [k, v] of Object.entries(settings.map2 || {})) if (v && (v.label || k === 'submit')) kept[k] = v;
  if (Object.keys(kept).length !== Object.keys(settings.map2 || {}).length) {
    settings.map2 = kept;
    await chrome.storage.local.set({ map2: kept });
  }
  $('s-cms').value = settings.cmsUrl2;
  $('s-submit').checked = settings.autoSubmit;
  $('s-date').checked = settings.setDate;
  $('s-cover').checked = settings.importCover;
  $('f-credit').checked = settings.credit;
  $('f-category').value = settings.category;
  $('s-moj-cms').value = settings.mojUrl;
  $('s-moj-save').checked = settings.mojAutoSave;
  $('s-moj-cover').checked = settings.mojImportCover;
  $('f-moj-category').value = settings.mojCategory;
  renderMap();
}

function renderMap() {
  const body = $('map-table').tBodies[0];
  body.textContent = '';
  for (const [key, label] of FIELDS) {
    const tr = body.insertRow();
    tr.insertCell().textContent = label.charAt(0).toUpperCase() + label.slice(1);
    const m = settings.map2[key];
    const sel = tr.insertCell();
    sel.className = 'sel';
    sel.textContent = m ? (m.label || m.selector) : (key === 'submit' ? 'chưa chỉ định' : 'tự dò theo nhãn');
    const act = tr.insertCell();
    const pick = document.createElement('button');
    pick.type = 'button'; pick.textContent = 'Chỉ định';
    pick.addEventListener('click', () => startPick(key, label));
    act.append(pick);
    if (m) {
      const clear = document.createElement('button');
      clear.type = 'button'; clear.textContent = 'Xóa'; clear.style.marginLeft = '6px';
      clear.addEventListener('click', async () => { delete settings.map2[key]; await chrome.storage.local.set({ map2: settings.map2 }); renderMap(); });
      act.append(clear);
    }
  }
}

for (const [id, key, def] of [['s-cms', 'cmsUrl2', DEFAULT_CMS], ['s-moj-cms', 'mojUrl', DEFAULT_MOJ]]) {
  $(id).addEventListener('change', async () => {
    settings[key] = $(id).value.trim() || def;
    $(id).value = settings[key];
    await chrome.storage.local.set({ [key]: settings[key] });
  });
}
for (const [id, key] of [['s-submit', 'autoSubmit'], ['s-date', 'setDate'], ['s-cover', 'importCover'], ['f-credit', 'credit'],
  ['s-moj-save', 'mojAutoSave'], ['s-moj-cover', 'mojImportCover']]) {
  $(id).addEventListener('change', () => { settings[key] = $(id).checked; chrome.storage.local.set({ [key]: settings[key] }); });
}
for (const [id, key] of [['f-category', 'category'], ['f-moj-category', 'mojCategory']]) {
  $(id).addEventListener('change', () => { settings[key] = $(id).value.trim(); chrome.storage.local.set({ [key]: settings[key] }); });
}
chrome.storage.onChanged.addListener((changes) => {
  if (changes.map2) { settings.map2 = changes.map2.newValue || {}; renderMap(); }
});

// ---------- Tab CMS ----------
const trimUrl = (u) => (u || '').split(/[?#]/)[0].replace(/\/+$/, '');
const originOf = (u, def) => { try { return new URL(u).origin; } catch (e) { return new URL(def).origin; } };

function waitLoaded(tabId, ms = 30000) {
  return new Promise((resolve) => {
    const done = () => { chrome.tabs.onUpdated.removeListener(on); clearTimeout(timer); resolve(); };
    const on = (id, info) => { if (id === tabId && info.status === 'complete') done(); };
    const timer = setTimeout(done, ms);
    chrome.tabs.onUpdated.addListener(on);
    chrome.tabs.get(tabId).then((t) => { if (t.status === 'complete') done(); }).catch(done);
  });
}

async function focusTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
}

// PLQG: tìm tab CMS đang mở (ưu tiên tab dùng gần nhất); chưa có thì mở trang quản lý bài viết.
async function getPlqTab() {
  const origin = originOf(settings.cmsUrl2, DEFAULT_CMS);
  const tabs = (await chrome.tabs.query({})).filter((t) => (t.url || '').startsWith(origin + '/'));
  if (tabs.length) return { tab: tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0], opened: false };
  const tab = await chrome.tabs.create({ url: settings.cmsUrl2, active: false });
  await waitLoaded(tab.id);
  return { tab, opened: true };
}

// Moj: chỉ dùng tab đang ở đúng trang «Thêm mới tin bài» (địa chỉ không kèm mã bài), để không ghi đè bài đã lưu.
// Chưa có thì mở trang đó trong tab mới.
async function getMojTab() {
  const base = trimUrl(settings.mojUrl);
  const tabs = (await chrome.tabs.query({})).filter((t) => trimUrl(t.url) === base);
  if (tabs.length) return { tab: tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0], opened: false };
  const tab = await chrome.tabs.create({ url: settings.mojUrl, active: false });
  await waitLoaded(tab.id);
  await sleep(1500);
  return { tab, opened: true };
}

// Moj: tiêm moj-cms.js rồi gọi một hàm trong trang (cùng ngữ cảnh với trang để dùng được TinyMCE).
async function run(tabId, func, args = []) {
  await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['moj-cms.js'] });
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func, args });
  return res ? res.result : null;
}

// Đang ở trang đăng nhập CMS thì chưa điền được.
async function atLogin(tab) {
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: () => !!document.querySelector('input[type=password]') });
    return !!(r && r.result);
  } catch (e) { return false; }
}

async function startPick(field, label) {
  try {
    const { tab } = await getPlqTab();
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['cms-pick.js'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (f, l) => danBaiPick(f, l), args: [field, label] });
    await focusTab(tab);
  } catch (e) {
    setStatus($('fill-status'), 'Không mở được trang CMS: ' + e.message, 'err');
  }
}

$('diag-btn').addEventListener('click', async () => {
  try {
    const { tab } = await getPlqTab();
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['cms-fill.js'] });
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: () => danBaiDiag() });
    await navigator.clipboard.writeText(res.result || '');
    $('diag-status').textContent = 'Đã sao chép. Hãy dán vào tin nhắn gửi người hỗ trợ.';
  } catch (e) {
    $('diag-status').textContent = 'Không lấy được: ' + e.message;
  }
});

$('moj-diag-btn').addEventListener('click', async () => {
  try {
    const all = await chrome.tabs.query({});
    const base = trimUrl(settings.mojUrl);
    const origin = originOf(settings.mojUrl, DEFAULT_MOJ);
    const targets = [
      all.find((t) => trimUrl(t.url) === base) || all.filter((t) => (t.url || '').startsWith(origin + '/')).sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0],
      all.find((t) => MEDIA_RE.test(t.url || '')),
    ].filter(Boolean);
    if (!targets.length) throw new Error('chưa có tab CMS nào đang mở');
    const parts = [];
    for (const t of targets) parts.push(await run(t.id, () => mojDiag()));
    await navigator.clipboard.writeText(parts.join('\n\n==========\n\n'));
    $('moj-diag-status').textContent = `Đã sao chép (${targets.length} trang). Hãy dán vào tin nhắn gửi người hỗ trợ.`;
  } catch (e) {
    $('moj-diag-status').textContent = 'Không lấy được: ' + e.message;
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'picked') {
    chrome.tabs.getCurrent().then((t) => t && focusTab(t));
    $('settings').open = true;
  }
  if (msg.type === 'prefill' && msg.url) { $('url').value = msg.url; }
});

// ---------- Lấy bài ----------
// Dự phòng cho trang chặn tải trực tiếp hoặc dựng nội dung bằng JavaScript: mở trang trong tab nền rồi đọc HTML.
async function htmlViaTab(url) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitLoaded(tab.id, 25000);
    await sleep(1200);
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => document.documentElement.outerHTML });
    return res.result;
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

// Link Google Docs: tiện ích tải bản xuất HTML bằng phiên đăng nhập Google của trình duyệt (nếu có).
const GDOC_RE = /docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([\w-]+)/;
const DOC_HELP = 'Không đọc được tài liệu Google Docs. Hãy mở tài liệu, bấm Chia sẻ, chọn «Bất kỳ ai có đường liên kết» (quyền Người xem), hoặc đăng nhập Google trên trình duyệt này bằng tài khoản có quyền xem tài liệu.';
async function getGoogleDoc(id, url) {
  let res;
  try {
    res = await fetch(`https://docs.google.com/document/d/${id}/export?format=html`, { credentials: 'include', redirect: 'follow' });
  } catch (e) { throw new Error(DOC_HELP); }
  if (!res.ok || /accounts\.google\.com/.test(res.url)) throw new Error(DOC_HELP);
  const html = await res.text();
  if (!/<body/i.test(html)) throw new Error(DOC_HELP);
  return DanBai.docFromHtml(html, url);
}

// Nén ảnh, đổi base64 và tải ảnh (kể cả từ Drive): xem imgtools.js.

// Ảnh mở đầu bài (đứng trước phần lớn nội dung): dùng làm ảnh đại diện, chú thích của nó thành «Chú thích ảnh đại diện»,
// và bỏ khỏi nội dung vì CMS đã hiển thị ảnh đại diện ở đầu bài.
function takeLead(html) {
  const d = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const img = d.body.querySelector('img');
  if (!img) return null;
  const r = d.createRange();
  r.setStart(d.body, 0); r.setEndBefore(img);
  if (clean(r.toString()).length > 600) return null;
  const src = img.getAttribute('src') || '';
  let caption = ''; let drop = [img];
  const fig = img.closest('figure'); const table = img.closest('table');
  if (fig && fig.querySelectorAll('img').length === 1) {
    const fc = fig.querySelector('figcaption');
    caption = clean(fc ? fc.textContent : fig.textContent); drop = [fig];
  } else if (table && table.querySelectorAll('img').length === 1 && clean(table.textContent).length <= 300) {
    caption = clean(table.textContent); drop = [table];
  } else {
    let block = img;
    while (block.parentElement && block.parentElement !== d.body && !clean(block.parentElement.textContent)
      && block.parentElement.querySelectorAll('img').length === 1) block = block.parentElement;
    drop = [block];
    const next = block.nextElementSibling;
    const t = next && !next.querySelector('img') ? clean(next.textContent) : '';
    const em = next && next.querySelector('em, i');
    const centered = next && /text-align\s*:\s*center/i.test(next.getAttribute('style') || '');
    if (block !== img && t && t.length <= 250 && (centered || (em && clean(em.textContent) === t))) { caption = t; drop.push(next); }
  }
  drop.forEach((x) => x.remove());
  return { src, caption, html: d.body.innerHTML.trim() };
}

// PLQG: thay mỗi ảnh trong tài liệu bằng dấu [[ẢNH n]] để CMS chèn ảnh đúng vị trí đó sau.
function prepareDocImages(html) {
  const d = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
  const items = [];
  d.body.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || '';
    if (!/^https?:\/\//i.test(src)) { img.remove(); return; }
    const n = items.length + 1;
    items.push({ n, src });
    img.replaceWith(d.createTextNode(` [[ẢNH ${n}]] `));
  });
  return { html: d.body.innerHTML, items };
}

// Ảnh đang được tải vào kho (src → Promise). Yêu cầu trùng sẽ chờ cùng một tiến trình, không tải lại.
const storeJobs = new Map();
function downloadToStore(src, name) {
  if (!storeJobs.has(src)) {
    storeJobs.set(src, (async () => {
      try {
        const b = await fetchImageFile(src);
        if (window.DanBaiStore) window.DanBaiStore.add(`${name}.${b.ext}`, b.mime, b.b64, src);
        return b;
      } finally {
        storeJobs.delete(src);
      }
    })());
  }
  return storeJobs.get(src);
}

// Một ảnh theo địa chỉ: lấy từ kho ảnh (bản Android) nếu đã có; chưa có thì tải và lưu vào kho.
async function imageFromStoreOrWeb(src, name) {
  const st = window.DanBaiStore ? window.DanBaiStore.findBySource(src) : null;
  if (st) return { b64: window.DanBaiStore.readB64(st.id), mime: st.mime, ext: (st.mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg') };
  return downloadToStore(src, name);
}

async function fetchDocImages(items) {
  const ok = []; const fail = [];
  for (const it of items) {
    try {
      const b = await imageFromStoreOrWeb(it.src, `anh-trong-bai-${it.n}`);
      ok.push({ n: it.n, src: it.src, b64: b.b64, mime: b.mime, name: `anh-trong-bai-${it.n}.${b.ext}` });
    } catch (e) { fail.push(`ảnh ${it.n} (${e.message})`); }
  }
  return { ok, fail };
}

// Bản Android: tải ảnh của bài vào kho ngay khi lấy bài.
async function storeArticleImages() {
  const prep = prepareDocImages(article.html);
  if (!prep.items.length) return;
  setStatus($('status'), `Đang tải ${prep.items.length} ảnh vào kho ảnh…`);
  const got = await fetchDocImages(prep.items);
  const msg = `Ảnh trong kho: ${got.ok.length}/${prep.items.length}.` + (got.fail.length ? ' Lỗi: ' + got.fail.join('; ') : '');
  setStatus($('status'), $('status').textContent + ' ' + msg, got.fail.length ? 'err' : 'ok');
}

// Moj: ảnh còn lại trong tài liệu Google Docs có địa chỉ tạm thời nên không dùng trực tiếp trên CMS được:
// thay bằng dấu [[ẢNH n]] để chèn tay đúng chỗ.
function markDocImages(html) {
  const d = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
  let n = 0;
  d.body.querySelectorAll('img').forEach((img) => { n += 1; img.replaceWith(d.createTextNode(` [[ẢNH ${n}]] `)); });
  return { html: d.body.innerHTML, count: n };
}

async function getArticle(url) {
  const g = GDOC_RE.exec(url);
  if (g) return getGoogleDoc(g[1], url);
  let first = null; let err = null;
  try { first = DanBai.parseArticle(await DanBai.fetchHtml(url), url); } catch (e) { err = e; }
  if (first && first.length >= 400) return first;
  try {
    const second = DanBai.parseArticle(await htmlViaTab(url), url);
    if (!first || second.length > first.length) return second;
  } catch (e) { err = err || e; }
  if (first) return first;
  throw err;
}

$('fetch-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = $('url').value.trim();
  if (!/^https?:\/\//i.test(url)) { setStatus($('status'), 'Link phải bắt đầu bằng http:// hoặc https://', 'err'); return; }
  $('fetch-btn').disabled = true;
  setStatus($('status'), 'Đang lấy bài…');
  setStatus($('fill-status'), '');
  try {
    article = await getArticle(url);
    // Ảnh mở đầu bài (nếu có) là ảnh đại diện cho cả hai CMS; chú thích của nó dùng cho CMS Moj.
    // Nội dung ở đây giữ nguyên ảnh đó: PLQG để trong bài, Moj bỏ khỏi bài lúc điền.
    let cover = article.cover || ''; let caption = '';
    const lead = takeLead(article.html);
    if (lead && lead.src && (!article.fromDoc || !cover || lead.src === cover)) { cover = lead.src; caption = lead.caption; }
    $('f-title').value = article.title;
    $('f-sapo').value = article.sapo;
    $('f-site').value = article.site;
    $('f-author').value = article.site ? 'Theo ' + article.site : article.author;
    $('f-moj-author').value = article.author || '';
    if (article.category) $('f-category').value = article.category;
    $('f-cover').value = cover;
    $('f-caption').value = caption;
    $('f-body').innerHTML = article.html; // đã làm sạch trong extract.js
    $('article').hidden = false;
    const imgs = $('f-body').querySelectorAll('img').length;
    setStatus($('status'), `Đã lấy bài: khoảng ${article.length.toLocaleString('vi-VN')} ký tự, ${imgs} ảnh`
      + (cover ? '' : ', chưa có ảnh đại diện') + '. Hãy đọc lại trước khi điền vào CMS.' + (article.notes ? ' ' + article.notes.join(' ') : ''), 'ok');
    if (article.fromDoc && window.DanBaiStore) await storeArticleImages();
  } catch (err) {
    $('article').hidden = true;
    setStatus($('status'), 'Không lấy được bài: ' + (err && err.message ? err.message : err), 'err');
  } finally {
    $('fetch-btn').disabled = false;
  }
});

// ---------- Dữ liệu để điền ----------
function creditHtml() {
  if (!$('f-credit').checked || !article) return '';
  const site = $('f-site').value.trim();
  const p = document.createElement('p');
  p.style.textAlign = 'right';
  const em = document.createElement('em');
  const a = document.createElement('a');
  a.href = article.url; a.textContent = site || article.url;
  em.append('Theo ', a);
  p.append(em);
  return '\n' + p.outerHTML;
}
const coverUrl = () => { const c = $('f-cover').value.trim(); return /^https?:\/\//i.test(c) ? c : ''; };

function buildPlqData() {
  return {
    title: $('f-title').value.trim(), sapo: $('f-sapo').value.trim(), html: DanBai.sanitizeHtml($('f-body').innerHTML) + creditHtml(),
    author: $('f-author').value.trim(), site: $('f-site').value.trim(), category: $('f-category').value.trim(), cover: coverUrl(),
  };
}

function buildMojData() {
  let html = DanBai.sanitizeHtml($('f-body').innerHTML);
  const cover = coverUrl();
  // CMS Moj tự hiển thị ảnh đại diện ở đầu bài nên bỏ ảnh mở đầu (và chú thích của nó) khỏi nội dung.
  const lead = takeLead(html);
  if (lead && lead.src === cover) html = lead.html;
  let marked = 0;
  if (article && article.fromDoc) { const m = markDocImages(html); html = m.html; marked = m.count; }
  const plain = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const author = $('f-moj-author').value.trim();
  if (author) {
    const holder = document.createElement('div');
    holder.innerHTML = html;
    if (!plain(holder.textContent).endsWith(plain(author))) {
      const p = document.createElement('p');
      p.style.textAlign = 'right';
      const b = document.createElement('strong');
      b.textContent = author;
      p.append(b);
      html += '\n' + p.outerHTML;
    }
  }
  html += creditHtml();
  return {
    title: $('f-title').value.trim(), sapo: $('f-sapo').value.trim(), html, marked,
    category: $('f-moj-category').value.trim(), cover, caption: $('f-caption').value.trim(),
  };
}

// ---------- Điền vào CMS PLQG ----------
// Tải ảnh đại diện của bài gốc về trình duyệt (tiện ích có quyền truy cập mọi trang), rồi đưa vào CMS dưới dạng tệp.
async function fetchCover(url) {
  const f = await imageFromStoreOrWeb(url, 'anh-dai-dien');
  return { b64: f.b64, mime: f.mime, name: 'anh-dai-dien.' + f.ext };
}

$('fill-plq').addEventListener('click', async () => {
  const st = $('fill-status');
  const data = buildPlqData();
  if (!data.title || !data.html) { setStatus(st, 'Bài chưa có tiêu đề hoặc nội dung.', 'err'); return; }
  lockFill(true);
  setStatus(st, 'Đang điền vào CMS PLQG…');
  try {
    let coverNote = '';
    let imageNote = '';
    if (article && article.fromDoc) {
      const prep = prepareDocImages(data.html);
      data.html = prep.html;
      if (prep.items.length) {
        setStatus(st, `Đang tải ${prep.items.length} ảnh từ tài liệu…`);
        const got = await fetchDocImages(prep.items);
        data.bodyImages = got.ok;
        data.imageFails = got.fail;
        if (got.fail.length) imageNote = ' Không tải được: ' + got.fail.join('; ') + '. Dấu [[ẢNH n]] còn trong bài, hãy chèn ảnh đó tay rồi xóa dấu.';
      }
    }
    // Ảnh đại diện: dùng lại đúng ảnh đã tải cho bài (ảnh đó vừa là ảnh đại diện vừa là ảnh đầu tiên của bài).
    if (settings.importCover) {
      if (!data.cover) {
        if (article && article.fromDoc) coverNote = ' Ảnh đại diện: không có ảnh nào ngay sau sapo nên chưa chọn được.';
      } else {
        const same = (data.bodyImages || []).find((x) => x.src === data.cover);
        if (same) {
          data.coverFile = { b64: same.b64, mime: same.mime, name: 'anh-dai-dien.' + (same.mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg') };
        } else {
          try { data.coverFile = await fetchCover(data.cover); }
          catch (e) { coverNote = ' Ảnh đại diện chưa đẩy lên được (' + e.message + ').'; }
        }
      }
    }
    const { tab, opened } = await getPlqTab();
    if (await atLogin(tab)) {
      setStatus(st, 'CMS PLQG đang ở trang đăng nhập. Hãy đăng nhập, khi vào được trang quản lý bài viết thì bấm «Điền vào CMS PLQG» lại.', 'err');
      await focusTab(tab);
      return;
    }
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['cms-fill.js'] });
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, world: 'MAIN',
      func: (d, m, o) => danBaiFill(d, m, o),
      args: [data, settings.map2, { autoSubmit: settings.autoSubmit, setDate: settings.setDate, importCover: settings.importCover }],
    });
    const r = res.result || {};
    const names = { title: 'tiêu đề', sapo: 'tóm tắt', body: 'nội dung', author: 'tác giả', date: 'ngày đăng', cover: 'ảnh đại diện', category: 'danh mục' };
    const done = Object.keys(names).filter((k) => r[k] === true).map((k) => names[k]);
    const missed = Object.keys(names).filter((k) => r[k] === false).map((k) => names[k]);
    const manual = Object.keys(names).filter((k) => r[k] === null && k !== 'sapo' && k !== 'author' && !(k === 'cover' && coverNote)).map((k) => names[k]);
    let text = done.length ? 'Đã điền: ' + done.join(', ') + '.' : '';
    if (missed.length) {
      text += ` Chưa điền được: ${missed.join(', ')}; hãy nhập tay các ô này` + (opened ? ' (nếu CMS chưa đăng nhập, hãy đăng nhập rồi bấm lại).' : '.');
    }
    if (done.length && manual.length) text += ` Cần tự làm trên CMS: ${manual.join(', ')}.`;
    if (r.submit === true) text += ' Đã bấm nút lưu.';
    else if (settings.autoSubmit && r.submit === false) text += ' Chưa bấm nút lưu' + (settings.map2.submit ? '.' : ' vì chưa chỉ định nút.');
    else if (done.length) text += ' Hãy kiểm tra rồi bấm lưu trên CMS.';
    if (r.notes && r.notes.length) text += ' ' + r.notes.join(' ');
    text += coverNote + imageNote;
    if (r.images && r.images.ok) text += ` Đã chèn ${r.images.ok}/${(data.bodyImages || []).length} ảnh vào nội dung.`;
    if (r.images && r.images.fail && r.images.fail.length) text += ' Chưa chèn được: ' + r.images.fail.join('; ') + '.';
    setStatus(st, 'CMS PLQG — ' + text.trim(), !done.length || missed.length ? 'err' : 'ok');
    if (done.length) await focusTab(tab);
  } catch (err) {
    setStatus(st, 'Không điền được vào CMS PLQG: ' + (err && err.message ? err.message : err), 'err');
  } finally {
    lockFill(false);
  }
});

// ---------- Điền vào CMS Moj ----------
// Ảnh đại diện: bấm «Chọn ảnh mới» trên CMS, tải ảnh lên cửa sổ kho ảnh, chọn ảnh đó, rồi điền chú thích.
// Bước nào trình duyệt hoặc kho ảnh không cho tự làm thì nhờ người dùng bấm giúp và làm tiếp.
async function doCover(tab, file, caption, st) {
  const state = await run(tab.id, () => mojCoverState());
  if (state && state.has) {
    const a = await run(tab.id, (c, ms) => mojAfterCover(c, ms), [caption, 1500]);
    return { cover: true, caption: a.caption, note: 'CMS đã có ảnh đại diện nên tiện ích giữ nguyên ảnh đó.' };
  }
  if (!state || !state.button) return { cover: false, note: 'Ảnh đại diện: không thấy nút «Chọn ảnh mới» trên CMS.' };

  const before = new Set((await chrome.tabs.query({})).map((t) => t.id));
  const findPopup = async () => (await chrome.tabs.query({})).find((t) => !before.has(t.id)
    && (t.openerTabId === tab.id || MEDIA_RE.test(t.url || t.pendingUrl || ''))) || null;
  await run(tab.id, () => mojClickCover());
  let pop = await poll(findPopup, 5000);
  if (!pop) {
    const ask = 'Trình duyệt đã chặn cửa sổ chọn ảnh. Hãy bấm nút «Chọn ảnh mới» trên CMS; tiện ích sẽ tự tải ảnh lên và làm tiếp.';
    setStatus(st, ask);
    await run(tab.id, (m) => mojBanner(m), [ask]);
    await focusTab(tab);
    pop = await poll(findPopup, 120000);
    await run(tab.id, () => mojBanner('')).catch(() => {});
  }
  if (!pop) return { cover: false, note: 'Ảnh đại diện: không mở được cửa sổ chọn ảnh.' };

  await waitLoaded(pop.id, 30000);
  setStatus(st, 'Đang tải ảnh đại diện lên kho ảnh của CMS…');
  let up;
  try { up = await run(pop.id, (f) => mojMediaUpload(f), [file]); } catch (e) { up = { ok: false, why: e.message }; }
  if (!up || !up.ok) return { cover: false, note: 'Ảnh đại diện: chưa tải được lên kho ảnh (' + ((up && up.why) || 'không rõ lý do') + '). Hãy chọn ảnh tay.' };

  const closed = async () => { try { await chrome.tabs.get(pop.id); return false; } catch (e) { return true; } };
  await run(pop.id, () => mojMediaChoose()).catch(() => {});
  let done = await poll(closed, 8000);
  if (!done) {
    const ask = 'Ảnh đã tải lên và được viền đỏ. Hãy bấm đúp vào ảnh đó để chọn làm ảnh đại diện.';
    setStatus(st, ask);
    await run(pop.id, (m) => mojBanner(m), [ask]).catch(() => {});
    await chrome.windows.update(pop.windowId, { focused: true }).catch(() => {});
    done = await poll(closed, 120000);
  }
  if (!done) return { cover: false, note: 'Ảnh đại diện: ảnh đã tải lên kho nhưng chưa được chọn.' };

  const a = await run(tab.id, (c) => mojAfterCover(c), [caption]);
  if (!a || !a.cover) return { cover: false, note: 'Ảnh đại diện: cửa sổ chọn ảnh đã đóng nhưng CMS chưa hiện ảnh.' };
  return { cover: true, caption: a.caption };
}

$('fill-moj').addEventListener('click', async () => {
  const st = $('fill-status');
  const data = buildMojData();
  if (!data.title || !data.html) { setStatus(st, 'Bài chưa có tiêu đề hoặc nội dung.', 'err'); return; }
  lockFill(true);
  setStatus(st, 'Đang điền vào CMS Moj…');
  try {
    const notes = [];
    let coverFile = null;
    if (settings.mojImportCover && data.cover) {
      setStatus(st, 'Đang tải ảnh đại diện từ bài gốc…');
      try {
        const f = await imageFromStoreOrWeb(data.cover, 'anh-dai-dien');
        coverFile = { b64: f.b64, mime: f.mime, name: `${Date.now().toString(36)}-anh-dai-dien.${f.ext}` };
      } catch (e) { notes.push('Ảnh đại diện: không tải được từ bài gốc (' + e.message + ').'); }
    }

    setStatus(st, 'Đang điền vào CMS Moj…');
    const { tab, opened } = await getMojTab();
    if (await atLogin(tab)) {
      setStatus(st, 'CMS Moj đang ở trang đăng nhập. Hãy đăng nhập, rồi bấm «Điền vào CMS Moj» lại.', 'err');
      await focusTab(tab);
      return;
    }
    // CMS đôi khi treo, không hiện form: tải lại trang (như bấm F5), chờ một chút rồi thử lại, tối đa 2 lần.
    const tryFill = async (ms) => {
      try { return (await run(tab.id, (d, w) => mojFill(d, w), [data, ms])) || { noForm: true, notes: ['CMS không phản hồi.'] }; }
      catch (e) { return { noForm: true, notes: ['CMS không phản hồi (' + e.message + ').'] }; }
    };
    let r = await tryFill(opened ? 15000 : 8000);
    for (let attempt = 1; attempt <= 2 && r.noForm; attempt++) {
      setStatus(st, `Trang CMS chưa tải xong, đang tải lại trang (lần ${attempt})…`);
      await chrome.tabs.reload(tab.id);
      await sleep(500);
      await waitLoaded(tab.id, 40000);
      await sleep(3000);
      setStatus(st, 'Đang điền vào CMS Moj…');
      r = await tryFill(20000);
    }
    if (r.noForm || r.busy) {
      setStatus(st, r.notes.join(' ') + (r.noForm ? ' Đã thử tải lại trang 2 lần. Nếu CMS chưa đăng nhập, hãy đăng nhập rồi bấm lại.' : ''), 'err');
      await focusTab(tab);
      return;
    }

    let cover = null; let caption = null;
    if (coverFile) {
      try {
        const c = await doCover(tab, coverFile, data.caption, st);
        cover = c.cover; caption = c.caption === undefined ? null : c.caption;
        if (c.note) notes.push(c.note);
      } catch (e) { cover = false; notes.push('Ảnh đại diện: ' + e.message); }
    }

    const res = { title: r.title, sapo: r.sapo, body: r.body, category: r.category, cover, caption };
    const names = { title: 'tiêu đề', sapo: 'tóm tắt', body: 'nội dung', cover: 'ảnh đại diện', caption: 'chú thích ảnh', category: 'chuyên mục chính' };
    const done = Object.keys(names).filter((k) => res[k] === true).map((k) => names[k]);
    const missed = Object.keys(names).filter((k) => res[k] === false).map((k) => names[k]);
    const manual = [];
    if (res.cover === null) manual.push('ảnh đại diện');
    if (res.category === null) manual.push('chuyên mục chính');

    let saved = null;
    if (settings.mojAutoSave && done.length) {
      if (missed.length) notes.push('Còn ô chưa điền được nên không tự bấm «Lưu và ở lại trang».');
      else {
        setStatus(st, 'Đang lưu bài trên CMS…');
        saved = await run(tab.id, () => mojSave()).catch(() => false);
      }
    }

    let text = done.length ? 'Đã điền: ' + done.join(', ') + '.' : '';
    if (missed.length) text += ` Chưa điền được: ${missed.join(', ')}; hãy nhập tay.`;
    if (done.length && manual.length) text += ` Cần tự làm trên CMS: ${manual.join(', ')}.`;
    if (data.marked) text += ` Trong nội dung còn ${data.marked} dấu [[ẢNH n]]: hãy chèn ảnh vào đúng chỗ rồi xóa dấu.`;
    if (saved === true) text += ' Đã bấm «Lưu và ở lại trang».';
    else if (saved === false) text += ' Chưa lưu được; hãy bấm «Lưu và ở lại trang» trên CMS.';
    else if (done.length) text += ' Hãy kiểm tra rồi bấm lưu trên CMS.';
    text += ' ' + [...(r.notes || []), ...notes].join(' ');
    setStatus(st, 'CMS Moj — ' + text.trim(), !done.length || missed.length || saved === false ? 'err' : 'ok');
    await focusTab(tab);
  } catch (err) {
    setStatus(st, 'Không điền được vào CMS Moj: ' + (err && err.message ? err.message : err), 'err');
  } finally {
    lockFill(false);
  }
});

// ---------- Khởi động ----------
loadSettings().then(() => {
  const pre = new URLSearchParams(location.search).get('url');
  const isCms = pre && (pre.startsWith(originOf(settings.cmsUrl2, DEFAULT_CMS)) || pre.startsWith(originOf(settings.mojUrl, DEFAULT_MOJ) + '/cms'));
  if (pre && !isCms) $('url').value = pre;
});
