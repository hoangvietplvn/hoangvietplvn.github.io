// Thanh tiến độ đọc
const bar = document.querySelector('.progress');
if (bar && document.body.classList.contains('post')) {
  const update = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
  };
  addEventListener('scroll', update, { passive: true });
  update();
}

// Lọc bài trong trang Lưu trữ
const input = document.querySelector('[data-filter]');
if (input) {
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();
  input.addEventListener('input', () => {
    const q = norm(input.value.trim());
    let any = false;
    document.querySelectorAll('[data-year]').forEach((year) => {
      let shown = 0;
      year.querySelectorAll('[data-item]').forEach((li) => {
        const ok = norm(li.textContent).includes(q);
        li.hidden = !ok;
        if (ok) shown++;
      });
      year.hidden = shown === 0;
      any = any || shown > 0;
    });
    document.querySelector('.noresult').hidden = any;
  });
}

// Thanh điểm tin đầu trang
(async () => {
  const bar = document.querySelector('.newsbar');
  if (!bar) return;
  let data;
  try {
    const res = await fetch(bar.dataset.src + '?t=' + Math.floor(Date.now() / 6e5));
    if (!res.ok) return;
    data = await res.json();
  } catch (e) { return; }
  const cats = (data.categories || []).filter((c) => c && Array.isArray(c.items) && c.items.length);
  if (!cats.length || Date.now() - Date.parse(data.updated) > 36 * 3600e3) return; // dữ liệu quá cũ thì ẩn
  const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
  const ago = (iso) => {
    const m = Math.round((Date.now() - Date.parse(iso)) / 6e4);
    if (!Number.isFinite(m) || m < 0) return '';
    if (m < 1) return 'vừa xong';
    if (m < 60) return m + ' phút trước';
    if (m < 1440) return Math.round(m / 60) + ' giờ trước';
    return Math.round(m / 1440) + ' ngày trước';
  };
  const link = (it, cls) => {
    const a = el('a', cls, it.t);
    if (/^https?:\/\//i.test(it.u)) a.href = it.u;
    a.target = '_blank'; a.rel = 'noopener nofollow';
    return a;
  };
  const meta = (it) => [it.s, it.d && ago(it.d)].filter(Boolean).join(' · ');

  const row = el('div', 'nb-row wrap');
  const label = el('span', 'nb-label', data.label || 'Tin nóng');
  const tabs = el('div', 'nb-tabs'); tabs.setAttribute('role', 'tablist');
  const now = el('div', 'nb-now'); now.setAttribute('aria-live', 'off');
  const more = el('button', 'nb-more', 'Xem thêm'); more.type = 'button'; more.setAttribute('aria-expanded', 'false');
  const panel = el('div', 'nb-panel wrap'); panel.hidden = true;
  row.append(label, tabs, now, more); bar.append(row, panel);

  let ci = 0, ii = 0, timer = null, paused = false;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const show = () => {
    const it = cats[ci].items[ii % cats[ci].items.length];
    now.classList.remove('nb-in'); void now.offsetWidth;
    now.replaceChildren(link(it, 'nb-head'), el('span', 'nb-meta', meta(it)));
    now.classList.add('nb-in');
  };
  const fill = () => {
    const ol = el('ol', 'nb-list');
    cats[ci].items.forEach((it) => { const li = el('li'); li.append(link(it), el('span', 'nb-meta', meta(it))); ol.append(li); });
    const t = new Date(data.updated);
    const note = el('p', 'nb-note', `Tiêu đề lấy tự động từ các báo, bấm để đọc bài gốc. Cập nhật lúc ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}.`);
    panel.replaceChildren(ol, note);
  };
  const pick = (i) => {
    ci = i; ii = 0;
    [...tabs.children].forEach((b, k) => { b.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
    show(); fill();
  };
  cats.forEach((c, i) => {
    const b = el('button', 'nb-tab', c.name); b.type = 'button'; b.setAttribute('role', 'tab');
    b.addEventListener('click', () => pick(i));
    tabs.append(b);
  });
  more.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    more.setAttribute('aria-expanded', String(!panel.hidden));
    more.textContent = panel.hidden ? 'Xem thêm' : 'Thu gọn';
  });
  bar.addEventListener('mouseenter', () => { paused = true; });
  bar.addEventListener('mouseleave', () => { paused = false; });
  bar.addEventListener('focusin', () => { paused = true; });
  bar.addEventListener('focusout', () => { paused = false; });
  pick(0);
  bar.hidden = false;
  if (!still) timer = setInterval(() => { if (!paused && panel.hidden && !document.hidden) { ii++; show(); } }, 6000);
})();
