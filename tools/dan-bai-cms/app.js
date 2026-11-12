/* global DanBai, danBaiFill, danBaiPick */
const $ = (id) => document.getElementById(id);
const DEFAULT_CMS = 'https://cms.phapluat.gov.vn/admin/';
const FIELDS = [
  ['title', 'ô Tiêu đề'],
  ['sapo', 'ô Sapo'],
  ['body', 'ô Nội dung'],
  ['author', 'ô Tác giả (tùy chọn)'],
  ['source', 'ô Nguồn (tùy chọn)'],
  ['submit', 'nút Gửi duyệt (tùy chọn)'],
];

let settings = { cmsUrl: DEFAULT_CMS, map: {}, autoSubmit: false };
let article = null;

function setStatus(el, text, kind) { el.textContent = text; el.className = 'status' + (kind ? ' ' + kind : ''); }

// ---------- Thiết lập ----------
async function loadSettings() {
  settings = await chrome.storage.local.get(settings);
  $('s-cms').value = settings.cmsUrl;
  $('s-submit').checked = settings.autoSubmit;
  renderMap();
}

function renderMap() {
  const body = $('map-table').tBodies[0];
  body.textContent = '';
  for (const [key, label] of FIELDS) {
    const tr = body.insertRow();
    tr.insertCell().textContent = label.charAt(0).toUpperCase() + label.slice(1);
    const m = settings.map[key];
    const sel = tr.insertCell();
    sel.className = 'sel';
    sel.textContent = m ? (m.frame ? m.frame + ' ▸ ' : '') + m.selector : (key === 'author' || key === 'source' || key === 'submit' ? 'chưa chỉ định' : 'tự dò');
    const act = tr.insertCell();
    const pick = document.createElement('button');
    pick.type = 'button'; pick.textContent = 'Chỉ định';
    pick.addEventListener('click', () => startPick(key, label));
    act.append(pick);
    if (m) {
      const clear = document.createElement('button');
      clear.type = 'button'; clear.textContent = 'Xóa'; clear.style.marginLeft = '6px';
      clear.addEventListener('click', async () => { delete settings.map[key]; await chrome.storage.local.set({ map: settings.map }); renderMap(); });
      act.append(clear);
    }
  }
}

$('s-cms').addEventListener('change', async () => {
  settings.cmsUrl = $('s-cms').value.trim() || DEFAULT_CMS;
  await chrome.storage.local.set({ cmsUrl: settings.cmsUrl });
});
$('s-submit').addEventListener('change', async () => {
  settings.autoSubmit = $('s-submit').checked;
  await chrome.storage.local.set({ autoSubmit: settings.autoSubmit });
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes.map) { settings.map = changes.map.newValue || {}; renderMap(); }
});

// ---------- Tab CMS ----------
function cmsOrigin() { try { return new URL(settings.cmsUrl).origin; } catch (e) { return new URL(DEFAULT_CMS).origin; } }

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
  const tab = await chrome.tabs.create({ url: settings.cmsUrl, active: false });
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
    $('f-author').value = article.author;
    $('f-site').value = article.site;
    $('f-body').innerHTML = article.html; // đã làm sạch trong extract.js
    $('cover-row').hidden = !article.cover;
    if (article.cover) { $('cover-link').href = article.cover; $('cover-link').textContent = article.cover; }
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
  return { title: $('f-title').value.trim(), sapo: $('f-sapo').value.trim(), html, author: $('f-author').value.trim(), site };
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
      func: (d, m, s) => danBaiFill(d, m, s), args: [data, settings.map, settings.autoSubmit],
    });
    const r = res.result || {};
    const names = { title: 'tiêu đề', sapo: 'sapo', body: 'nội dung', author: 'tác giả', source: 'nguồn' };
    const done = Object.keys(names).filter((k) => r[k] === true).map((k) => names[k]);
    const missed = ['title', 'sapo', 'body'].filter((k) => r[k] === false).map((k) => names[k]);
    let text = done.length ? 'Đã điền: ' + done.join(', ') + '.' : '';
    if (missed.length) {
      text += ` Không tìm thấy ô ${missed.join(', ')}.` + (opened
        ? ' Hãy đăng nhập CMS, mở trang soạn bài mới rồi bấm lại.'
        : ' Hãy mở trang soạn bài mới trên CMS rồi bấm lại, hoặc dùng «Chỉ định» trong phần Thiết lập CMS.');
      $('settings').open = true;
    }
    if (r.submit === true) text += ' Đã bấm nút gửi duyệt.';
    else if (settings.autoSubmit && r.submit === false) text += ' Chưa gửi duyệt' + (settings.map.submit ? '.' : ' vì chưa chỉ định nút gửi duyệt.');
    else if (!missed.length) text += ' Hãy kiểm tra trên CMS rồi bấm gửi duyệt.';
    if (r.notes && r.notes.length) text += ' ' + r.notes.join(' ');
    setStatus(st, text.trim(), missed.length ? 'err' : 'ok');
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
