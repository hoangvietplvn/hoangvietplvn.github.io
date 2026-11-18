// Bấm biểu tượng tiện ích: mở trang công cụ, kèm link của tab đang xem (nếu là bài báo).
chrome.action.onClicked.addListener(async (tab) => {
  const appUrl = chrome.runtime.getURL('app.html');
  const current = tab && /^https?:/.test(tab.url || '') ? tab.url : '';
  const existing = (await chrome.tabs.query({})).find((t) => (t.url || '').startsWith(appUrl));
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    if (current) chrome.tabs.sendMessage(existing.id, { type: 'prefill', url: current }).catch(() => {});
    return;
  }
  chrome.tabs.create({ url: appUrl + (current ? '?url=' + encodeURIComponent(current) : '') });
});
