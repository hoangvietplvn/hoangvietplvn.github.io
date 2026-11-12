/* global DanBai, danBaiFill, danBaiPick, danBaiDiag */
const $ = (id) => document.getElementById(id);
const DEFAULT_CMS = 'https://cms.phapluat.gov.vn/admin/content-articles/review';
const FIELDS = [
  ['title', 'ô Tiêu đề'],
  ['sapo', 'ô Tóm tắt'],
  ['body', 'ô Nội dung'],
  ['author', 'ô Tác giả'],
  ['date', 'ô Ngày đăng'],
  ['category', 'ô Danh mục'],
  ['submit', 'nút Lưu hoặc Gửi phê duyệt'],
];

// map2: bản chỉ định ô của phiên bản này (bản cũ lưu ở «map» không còn dùng).
let settings = { cmsUrl2: DEFAULT_CMS, map2: {}, autoSubmit: false, setDate: true, importCover: true, credit: false, category: 'Tin hoạt động' };
let article = null;

function setStatus(el, text, kind) { el.textContent = text; el.className = 'status' + (kind ? ' ' + kind : ''); }

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

$('s-cms').addEventListener('change', async () => {
  settings.cmsUrl2 = $('s-cms').value.trim() || DEFAULT_CMS;
  $('s-cms').value = settings.cmsUrl2;
  await chrome.storage.local.set({ cmsUrl2: settings.cmsUrl2 });
});
for (const [id, key] of [['s-submit', 'autoSubmit'], ['s-date', 'setDate'], ['s-cover', 'importCover'], ['f-credit', 'credit']]) {
  $(id).addEventListener('change', () => { settings[key] = $(id).checked; chrome.storage.local.set({ [key]: settings[key] }); });
}
$('f-category').addEventListener('change', () => { settings.category = $('f-category').value.trim(); chrome.storage.local.set({ category: settings.category }); });
chrome.storage.onChanged.addListener((changes) => {
  if (changes.map2) { settings.map2 = changes.map2.newValue || {}; renderMap(); }
});

// ---------- Tab CMS ----------
function cmsOrigin() { try { return new URL(settings.cmsUrl2).origin; } catch (e) { return new URL(DEFAULT_CMS).origin; } }

function waitLoaded(tabId, ms = 30000) {
  return new Promise((resolve) => {
    const done = () => { chrome.tabs.onUpdated.removeListener(on); clearTimeout(timer); resolve(); };
    const on = (id, info) => { if (id === tabId && info.status === 'complete') done(); };
    const timer = setTimeout(done, ms);
    chrome.tabs.onUpdated.addListener(on);
    chrome.tabs.get(tabId).then((t) => { if (t.status === 'complete') done(); }).catch(done);
  });
}

// Tìm tab CMS đang mở (ưu tiên tab dùng gần nhất); chưa có thì mở trang soạn bài.
async function getCmsTab() {
  const origin = cmsOrigin();
  const tabs = (await chrome.tabs.query({})).filter((t) => (t.url || '').startsWith(origin + '/'));
  if (tabs.length) return { tab: tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0], opened: false };
  const tab = await chrome.tabs.create({ url: settings.cmsUrl2, active: false });
  await waitLoaded(tab.id);
  return { tab, opened: true };
}

async function focusTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
}

async function startPick(field, label) {
  try {
    const { tab } = await getCmsTab();
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['cms-pick.js'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: (f, l) => danBaiPick(f, l), args: [field, label] });
    await focusTab(tab);
  } catch (e) {
    setStatus($('fill-status'), 'Không mở được trang CMS: ' + e.message, 'err');
  }
}

$('diag-btn').addEventListener('click', async () => {
  try {
    const { tab } = await getCmsTab();
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['cms-fill.js'] });
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: () => danBaiDiag() });
    await navigator.clipboard.writeText(res.result || '');
    $('diag-status').textContent = 'Đã sao chép. Hãy dán vào tin nhắn gửi người hỗ trợ.';
  } catch (e) {
    $('diag-status').textContent = 'Không lấy được: ' + e.message;
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
    await new Promise((r) => setTimeout(r, 1200));
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

function blobToB64(blob) {
  return new Promise((ok, bad) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result).split(',')[1]);
    fr.onerror = () => bad(fr.error);
    fr.readAsDataURL(blob);
  });
}

// Tải một ảnh (kể cả ảnh trên Drive, bằng phiên đăng nhập của trình duyệt) để đưa vào CMS dưới dạng tệp.
async function fetchImageB64(src) {
  const res = await fetch(src, { credentials: /drive\.google\.com/.test(src) ? 'include' : 'omit', redirect: 'follow' });
  if (!res.ok) throw new Error('máy chủ trả về ' + res.status);
  const blob = await res.blob();
  if (!/^image\//.test(blob.type)) throw new Error('không phải ảnh (có thể cần quyền xem trên Drive)');
  if (blob.size > 10 * 1024 * 1024) throw new Error('ảnh lớn hơn 10MB');
  const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  return { b64: await blobToB64(blob), mime: blob.type, size: blob.size, ext };
}

// Thay mỗi ảnh trong bài bằng dấu [[ẢNH n]] để CMS chèn ảnh đúng vị trí đó sau.
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

async function fetchDocImages(items) {
  const ok = []; const fail = [];
  let total = 0;
  for (const it of items) {
    if (total > 30 * 1024 * 1024) { fail.push(`ảnh ${it.n} (vượt giới hạn tổng dung lượng)`); continue; }
    try {
      const b = await fetchImageB64(it.src);
      total += b.size;
      ok.push({ n: it.n, b64: b.b64, mime: b.mime, name: `anh-trong-bai-${it.n}.${b.ext}` });
    } catch (e) { fail.push(`ảnh ${it.n} (${e.message})`); }
  }
  return { ok, fail };
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
    $('f-title').value = article.title;
    $('f-sapo').value = article.sapo;
    $('f-site').value = article.site;
    $('f-author').value = article.site ? 'Theo ' + article.site : article.author;
    if (article.category) $('f-category').value = article.category;
    $('f-cover').value = article.cover;
    $('f-body').innerHTML = article.html; // đã làm sạch trong extract.js
    $('article').hidden = false;
    const imgs = $('f-body').querySelectorAll('img').length;
    setStatus($('status'), `Đã lấy bài: khoảng ${article.length.toLocaleString('vi-VN')} ký tự, ${imgs} ảnh. Hãy đọc lại trước khi điền vào CMS.` + (article.notes ? ' ' + article.notes.join(' ') : ''), 'ok');
  } catch (err) {
    $('article').hidden = true;
    setStatus($('status'), 'Không lấy được bài: ' + (err && err.message ? err.message : err), 'err');
  } finally {
    $('fetch-btn').disabled = false;
  }
});

// ---------- Điền vào CMS ----------
function buildData() {
  let html = DanBai.sanitizeHtml($('f-body').innerHTML);
  const site = $('f-site').value.trim();
  if ($('f-credit').checked && article) {
    const p = document.createElement('p');
    p.style.textAlign = 'right';
    const em = document.createElement('em');
    const a = document.createElement('a');
    a.href = article.url; a.textContent = site || article.url;
    em.append('Theo ', a);
    p.append(em);
    html += '\n' + p.outerHTML;
  }
  const cover = $('f-cover').value.trim();
  return {
    title: $('f-title').value.trim(), sapo: $('f-sapo').value.trim(), html, author: $('f-author').value.trim(), site,
    category: $('f-category').value.trim(), cover: /^https?:\/\//i.test(cover) ? cover : '',
  };
}

// Tải ảnh đại diện của bài gốc về trình duyệt (tiện ích có quyền truy cập mọi trang), rồi đưa vào CMS dưới dạng tệp.
async function fetchCover(url) {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error('máy chủ báo gốc trả về ' + res.status);
  const blob = await res.blob();
  if (!/^image\//.test(blob.type)) throw new Error('đường dẫn không phải ảnh');
  if (blob.size > 10 * 1024 * 1024) throw new Error('ảnh lớn hơn 10MB');
  const b64 = await new Promise((ok, bad) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result).split(',')[1]);
    fr.onerror = () => bad(fr.error);
    fr.readAsDataURL(blob);
  });
  const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  return { b64, mime: blob.type, name: 'anh-dai-dien.' + ext };
}

$('fill-btn').addEventListener('click', async () => {
  const st = $('fill-status');
  const data = buildData();
  if (!data.title || !data.html) { setStatus(st, 'Bài chưa có tiêu đề hoặc nội dung.', 'err'); return; }
  $('fill-btn').disabled = true;
  setStatus(st, 'Đang điền vào CMS…');
  try {
    let coverNote = '';
    if (settings.importCover && data.cover) {
      try { data.coverFile = await fetchCover(data.cover); }
      catch (e) { coverNote = ' Không tải được ảnh đại diện từ bài gốc (' + e.message + '); hãy tải ảnh rồi đẩy lên tay.'; }
    }
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
    const { tab, opened } = await getCmsTab();
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
    setStatus(st, text.trim(), !done.length || missed.length ? 'err' : 'ok');
    if (done.length) await focusTab(tab);
  } catch (err) {
    setStatus(st, 'Không điền được vào CMS: ' + (err && err.message ? err.message : err), 'err');
  } finally {
    $('fill-btn').disabled = false;
  }
});

// ---------- Khởi động ----------
loadSettings().then(() => {
  const pre = new URLSearchParams(location.search).get('url');
  if (pre && !pre.startsWith(cmsOrigin())) $('url').value = pre;
});
