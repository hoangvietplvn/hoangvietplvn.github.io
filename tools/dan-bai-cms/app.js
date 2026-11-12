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
let settings = { cmsUrl2: DEFAULT_CMS, map2: {}, autoSubmit: false, setDate: true, importCover: true, credit: false, category: '' };
let article = null;

function setStatus(el, text, kind) { el.textContent = text; el.className = 'status' + (kind ? ' ' + kind : ''); }

// ---------- Thiết lập ----------
async function loadSettings() {
  settings = await chrome.storage.local.get(settings);
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
    sel.textContent = m ? (m.frame ? m.frame + ' ▸ ' : '') + m.selector : (key === 'submit' ? 'chưa chỉ định' : 'tự dò theo nhãn');
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

async function getArticle(url) {
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
    $('f-cover').value = article.cover;
    $('f-body').innerHTML = article.html; // đã làm sạch trong extract.js
    $('article').hidden = false;
    const imgs = $('f-body').querySelectorAll('img').length;
    setStatus($('status'), `Đã lấy bài: khoảng ${article.length.toLocaleString('vi-VN')} ký tự, ${imgs} ảnh. Hãy đọc lại trước khi điền vào CMS.`, 'ok');
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

$('fill-btn').addEventListener('click', async () => {
  const st = $('fill-status');
  const data = buildData();
  if (!data.title || !data.html) { setStatus(st, 'Bài chưa có tiêu đề hoặc nội dung.', 'err'); return; }
  $('fill-btn').disabled = true;
  setStatus(st, 'Đang điền vào CMS…');
  try {
    const { tab, opened } = await getCmsTab();
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['cms-fill.js'] });
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, world: 'MAIN',
      func: (d, m, o) => danBaiFill(d, m, o),
      args: [data, settings.map2, { autoSubmit: settings.autoSubmit, setDate: settings.setDate, importCover: settings.importCover }],
    });
    const r = res.result || {};
    const names = { title: 'tiêu đề', sapo: 'tóm tắt', body: 'nội dung', author: 'tác giả', date: 'ngày đăng', cover: 'ảnh đại diện', category: 'danh mục' };
    const manualNames = { ...names, cover: 'ảnh đại diện (nếu chưa có)' };
    const done = Object.keys(names).filter((k) => r[k] === true).map((k) => names[k]);
    const missed = Object.keys(names).filter((k) => r[k] === false).map((k) => names[k]);
    const manual = Object.keys(names).filter((k) => r[k] === null && k !== 'sapo' && k !== 'author').map((k) => manualNames[k]);
    let text = done.length ? 'Đã điền: ' + done.join(', ') + '.' : '';
    if (missed.length) {
      text += ` Chưa điền được: ${missed.join(', ')}; hãy nhập tay các ô này` + (opened ? ' (nếu CMS chưa đăng nhập, hãy đăng nhập rồi bấm lại).' : '.');
    }
    if (done.length && manual.length) text += ` Cần tự làm trên CMS: ${manual.join(', ')}.`;
    if (r.submit === true) text += ' Đã bấm nút lưu.';
    else if (settings.autoSubmit && r.submit === false) text += ' Chưa bấm nút lưu' + (settings.map2.submit ? '.' : ' vì chưa chỉ định nút.');
    else if (done.length) text += ' Hãy kiểm tra rồi bấm lưu trên CMS.';
    if (r.notes && r.notes.length) text += ' ' + r.notes.join(' ');
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
