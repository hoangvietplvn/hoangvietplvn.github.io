// Khu "Tin nổi bật" đầu trang nhất: mục tin, 5 tin nóng, infographic tóm tắt, gợi ý đề tài
(async () => {
  const hub = document.querySelector('.hub');
  if (!hub) return;
  // không có tin để hiện thì trả lại phần blog (kể cả khi đang tắt), tránh trang nhất trống
  const giveUp = () => document.body.classList.remove('blog-off');
  let data;
  try {
    const res = await fetch(hub.dataset.src + '?t=' + Math.floor(Date.now() / 6e5));
    if (!res.ok) return giveUp();
    data = await res.json();
  } catch (e) { return giveUp(); }
  const cats = (data.categories || []).filter((c) => c && Array.isArray(c.hot) && c.hot.length);
  if (!cats.length || Date.now() - Date.parse(data.updated) > 36 * 3600e3) return giveUp();

  const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
  const ok = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);
  const ago = (iso) => {
    const m = Math.round((Date.now() - Date.parse(iso)) / 6e4);
    if (!Number.isFinite(m) || m < 0) return '';
    if (m < 1) return 'vừa xong';
    if (m < 60) return m + ' phút trước';
    if (m < 1440) return Math.round(m / 60) + ' giờ trước';
    return Math.round(m / 1440) + ' ngày trước';
  };
  const meta = (it) => [it.s, it.d && ago(it.d)].filter(Boolean).join(' · ');
  const ext = (it, cls, txt) => { const a = el('a', cls, txt ?? it.t); if (ok(it.u)) a.href = it.u; a.target = '_blank'; a.rel = 'noopener nofollow'; return a; };
  const pic = (src, cls) => {
    if (!ok(src)) return null;
    const i = el('img', cls); i.src = src; i.alt = ''; i.loading = 'lazy'; i.referrerPolicy = 'no-referrer';
    i.addEventListener('error', () => { i.closest('.hot-card, .info')?.classList.add('noimg'); i.remove(); });
    return i;
  };
  const heatText = (it) => (it.n > 1 ? `${it.n} báo cùng đưa tin` : 'Tin mới trong mục');
  const heat = (it) => { const h = el('span', 'heat'); for (let i = 1; i <= 5; i++) h.append(el('i', i <= Math.min(it.n || 1, 5) ? 'on' : '')); h.append(el('span', '', heatText(it))); return h; };

  const wrap = el('div', 'wrap');
  const head = el('div', 'hub-head');
  const t = new Date(data.updated), p2 = (n) => String(n).padStart(2, '0');
  const toBlog = el('a', 'hub-toblog', 'Xuống phần blog ↓'); toBlog.href = '#blog';
  head.append(el('span', 'nb-label', data.label || 'Tin nóng'), el('h2', 'hub-title', 'Tin nổi bật'), el('span', 'hub-updated', `Cập nhật ${p2(t.getHours())}:${p2(t.getMinutes())} · ${p2(t.getDate())}/${p2(t.getMonth() + 1)}`), toBlog);
  const tabs = el('div', 'hub-tabs'); tabs.setAttribute('role', 'tablist');
  const hot = el('div', 'hub-hot');
  const dlg = el('dialog', 'info');
  wrap.append(head, tabs, hot);

  /* ---- infographic ---- */
  function open(cat, it, rank) {
    const art = el('article');
    const hd = el('header', 'info-head');
    const close = el('button', 'info-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Đóng');
    close.addEventListener('click', () => dlg.close());
    hd.append(close, el('p', 'info-cat', `${cat.name} · Tin nóng số ${rank}`), el('h3', '', it.t), el('p', 'info-meta', meta(it)));
    art.append(hd);
    const im = pic(it.img, 'info-img'); if (im) art.append(im);
    const body = el('div', 'info-body');
    const sec = (title) => { const s = el('section', 'info-sec'); s.append(el('h4', '', title)); body.append(s); return s; };
    if (Array.isArray(it.p) && it.p.length) {
      const ol = el('ol', 'info-points'); it.p.forEach((x) => ol.append(el('li', '', x))); sec('Điểm chính').append(ol);
    }
    if (Array.isArray(it.nums) && it.nums.length) {
      const g = el('div', 'info-nums');
      it.nums.forEach((x) => { const d = el('div'); d.append(el('b', '', x.v), el('span', '', x.c)); g.append(d); });
      sec('Con số').append(g);
    }
    const hs = sec('Độ nóng');
    hs.append(heat(it), el('p', 'info-heatnote', it.n > 1 ? `Sự việc được ${it.n} báo đưa tin với ${it.k} bài trong 30 giờ qua.` : 'Mới có một báo trong danh sách nguồn đưa tin này.'));
    if (Array.isArray(it.also) && it.also.length) {
      const ul = el('ul', 'info-also');
      it.also.forEach((x) => { const li = el('li'); li.append(el('b', '', x.s), ext(x)); ul.append(li); });
      hs.append(ul);
    }
    art.append(body);
    const ft = el('footer', 'info-foot');
    ft.append(ext(it, 'info-cta', 'Xem toàn bộ nội dung →'), el('p', 'info-note', `Tóm tắt tự động từ tiêu đề và phần mở đầu của bài trên ${it.s}. Độ nóng tính theo số báo cùng đưa tin, không phải lượt xem.`));
    art.append(ft);
    dlg.className = 'info'; dlg.replaceChildren(art);
    dlg.showModal(); dlg.scrollTop = 0;
  }
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  /* ---- 5 tin nóng ---- */
  function render(ci) {
    const cat = cats[ci];
    [...tabs.children].forEach((b, k) => b.setAttribute('aria-selected', k === ci ? 'true' : 'false'));
    hot.replaceChildren(...cat.hot.slice(0, 5).map((it, i) => {
      const b = el('button', 'hot-card' + (i === 0 ? ' hot-lead' : '')); b.type = 'button';
      const im = pic(it.img, 'hot-img'); if (im) b.append(im); else b.classList.add('noimg');
      const tx = el('span', 'hot-text');
      tx.append(el('span', 'hot-rank', String(i + 1)), el('span', 'hot-title', it.t));
      if (i === 0 && it.p && it.p[0]) tx.append(el('span', 'hot-sapo', it.p[0]));
      tx.append(heat(it), el('span', 'hot-meta', meta(it)));
      b.append(tx);
      b.addEventListener('click', () => open(cat, it, i + 1));
      return b;
    }));
  }
  cats.forEach((c, i) => { const b = el('button', 'hub-tab', c.name); b.type = 'button'; b.setAttribute('role', 'tab'); b.addEventListener('click', () => render(i)); tabs.append(b); });
  render(0);

  /* ---- gợi ý đề tài ---- */
  const topics = (data.topics || []).filter((x) => x && x.label && x.why);
  if (topics.length) {
    const sec = el('section', 'hub-topics');
    const hd = el('div', 'topics-head');
    hd.append(el('h2', 'hub-title', 'Đề tài có thể nóng sắp tới'), el('p', '', 'Gợi ý để triển khai bài viết, chọn tự động từ dòng tin 48 giờ qua.'));
    const grid = el('div', 'topic-grid');
    topics.forEach((tp) => {
      const c = el('article', 'topic');
      const tags = el('p', 'topic-tags'); tags.append(el('span', 'kind ' + (tp.kind === 'upcoming' ? 'up' : 'rise'), tp.kind === 'upcoming' ? 'Có mốc sắp tới' : 'Đang nổi lên'), el('span', '', tp.cat || ''));
      const why = el('p', 'topic-why'); why.append(el('b', '', 'Vì sao: '), document.createTextNode(tp.why));
      c.append(tags, el('h3', '', tp.label), why);
      if (Array.isArray(tp.refs) && tp.refs.length) { const ul = el('ul', 'topic-refs'); tp.refs.forEach((r) => { const li = el('li'); li.append(ext(r), el('span', '', ' — ' + r.s)); ul.append(li); }); c.append(ul); }
      grid.append(c);
    });
    sec.append(hd, grid); wrap.append(sec);
  }
  hub.append(wrap, dlg);
  hub.hidden = false;
  document.body.classList.add('has-hub');
})();
