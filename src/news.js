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
  // dải thương hiệu: logo sóng, tên trang, đồng hồ chạy theo thời gian thực
  const brand = el('div', 'hub-brand');
  const logo = el('span', 'brand-mark'); logo.setAttribute('aria-hidden', 'true');
  logo.innerHTML = '<svg viewBox="0 0 40 40"><defs><linearGradient id="bm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7ee8fa"/><stop offset="1" stop-color="#1e6fd9"/></linearGradient></defs><rect x="1" y="1" width="38" height="38" rx="11" fill="none" stroke="url(#bm)" stroke-width="2"/><path d="M8 24c3-4 6-4 9 0s6 4 9 0 5-4 6-2" fill="none" stroke="url(#bm)" stroke-width="2.6" stroke-linecap="round"/><path d="M8 17c3-4 6-4 9 0s6 4 9 0 5-4 6-2" fill="none" stroke="url(#bm)" stroke-width="2.6" stroke-linecap="round" opacity=".55"/></svg>';
  const bname = el('span', 'brand-name'); bname.append(el('b', '', hub.dataset.site || 'Bản tin'), el('span', '', 'Bản tin tổng hợp'));
  const clock = el('span', 'brand-clock');
  const DAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const tick = () => { const d = new Date(); clock.textContent = `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())} · ${DAYS[d.getDay()]}, ${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`; };
  tick(); setInterval(tick, 1000);
  brand.append(logo, bname, clock);
  // chỉ số nhanh
  const srcs = new Set(), allTin = new Set();
  cats.forEach((c) => [...(c.items || []), ...(c.hot || [])].forEach((x) => { if (x.s) srcs.add(x.s); allTin.add(x.u); }));
  const stats = el('div', 'hub-stats');
  const stat = (v, l) => { const d = el('span', 'stat'); d.append(el('b', '', String(v)), el('span', '', l)); return d; };
  stats.append(stat(srcs.size, 'báo nguồn'), stat(cats.length, 'chuyên mục'), stat(allTin.size, 'tin đang theo dõi'), stat(`${p2(t.getHours())}:${p2(t.getMinutes())}`, 'lần cập nhật gần nhất'));
  const titleBox = el('div', 'hub-titlebox');
  titleBox.append(el('span', 'nb-label', data.label || 'Tin nóng'), el('h2', 'hub-title', 'Tin nổi bật'), el('p', 'hub-sub', 'Toàn cảnh những sự kiện được nhiều báo cùng đưa tin, cập nhật mỗi 15 phút.'));
  head.append(brand, titleBox, stats, toBlog);
  const tabbar = el('div', 'hub-tabbar');
  const tabs = el('div', 'hub-tabs'); tabs.setAttribute('role', 'tablist');
  tabbar.append(tabs);
  const hot = el('div', 'hub-hot');
  const dlg = el('dialog', 'info');
  wrap.append(head, tabbar, hot);

  /* ---- infographic ---- */
  function open(cat, it, rank, warn) {
    const art = el('article');
    const hd = el('header', 'info-head');
    const close = el('button', 'info-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Đóng');
    close.addEventListener('click', () => dlg.close());
    hd.append(close, el('p', 'info-cat', warn ? `⚠ ${cat.name} · ${it.kind || 'Cảnh báo'}` : `${cat.name} · Tin nóng số ${rank}`), el('h3', '', it.t), el('p', 'info-meta', meta(it) || it.s));
    art.append(hd);
    const im = pic(it.img, 'info-img'); if (im) art.append(im);
    const body = el('div', 'info-body');
    const sec = (title) => { const s = el('section', 'info-sec'); s.append(el('h4', '', title)); body.append(s); return s; };
    if (Array.isArray(it.p) && it.p.length) {
      const ol = el('ol', 'info-points'); it.p.forEach((x) => ol.append(el('li', '', x))); sec(warn ? 'Nội dung cảnh báo' : 'Điểm chính').append(ol);
    }
    if (Array.isArray(it.nums) && it.nums.length) {
      const g = el('div', 'info-nums');
      it.nums.forEach((x) => { const d = el('div'); d.append(el('b', '', x.v), el('span', '', x.c)); g.append(d); });
      sec('Con số').append(g);
    }
    if (warn) {
      const ws = sec('Lưu ý');
      ws.append(el('p', 'info-heatnote', 'Không chia sẻ lại nội dung đã bị cảnh báo. Gặp thông tin nghi là tin giả, bạn có thể phản ánh tới Trung tâm Xử lý tin giả Việt Nam qua trang tingia.gov.vn.'));
    }
    const hs = warn ? el('section') : sec('Độ nóng');
    hs.append(heat(it), el('p', 'info-heatnote', it.n > 1 ? `Sự việc được ${it.n} báo đưa tin với ${it.k} bài trong 30 giờ qua.` : 'Mới có một báo trong danh sách nguồn đưa tin này.'));
    if (Array.isArray(it.also) && it.also.length) {
      const ul = el('ul', 'info-also');
      it.also.forEach((x) => { const li = el('li'); li.append(el('b', '', x.s), ext(x)); ul.append(li); });
      hs.append(ul);
    }
    art.append(body);
    const ft = el('footer', 'info-foot');
    ft.append(ext(it, 'info-cta', 'Xem toàn bộ nội dung →'), el('p', 'info-note', (it.x ? `Tóm tắt tự động: máy trích nguyên văn các câu chính trong bài trên ${it.s}.` : `Tóm tắt tự động từ tiêu đề và phần mở đầu của bài trên ${it.s}.`) + (warn ? ' Hãy đọc văn bản gốc trước khi dẫn lại.' : ' Độ nóng tính theo số báo cùng đưa tin, không phải lượt xem.')));
    art.append(ft);
    dlg.className = warn ? 'info warn' : 'info'; dlg.replaceChildren(art);
    dlg.showModal(); dlg.scrollTop = 0;
  }
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  /* ---- 5 tin nóng ---- */
  function render(ci) {
    const cat = cats[ci];
    [...tabs.children].forEach((b, k) => b.setAttribute('aria-selected', k === ci ? 'true' : 'false'));
    if (fakeBtn) fakeBtn.setAttribute('aria-selected', 'false');
    hot.className = 'hub-hot';
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
  /* ---- Cảnh báo tin giả: nút riêng, nổi bật ---- */
  const fk = data.fake && Array.isArray(data.fake.items) && data.fake.items.length ? data.fake : null;
  let fakeBtn = null;
  const when = (it) => it.d || it.seen;
  function renderFake() {
    [...tabs.children].forEach((b) => b.setAttribute('aria-selected', 'false'));
    fakeBtn.setAttribute('aria-selected', 'true');
    hot.className = 'hub-hot is-fake';
    const top = el('div', 'fake-head');
    const txt = el('div');
    txt.append(el('h3', '', fk.label), el('p', '', 'Tổng hợp cảnh báo, bác bỏ thông tin sai sự thật và xử lý người tung tin từ cơ quan chức năng, Trung tâm Xử lý tin giả Việt Nam (VAFC) và các báo nguồn. Bấm vào từng tin để xem tóm tắt.'));
    top.append(el('span', 'fake-icon', '!'), txt);
    const list = el('div', 'fake-list');
    fk.items.forEach((it) => {
      const b = el('button', 'fake-card' + (it.official ? ' official' : '')); b.type = 'button';
      const tags = el('span', 'fake-tags');
      tags.append(el('span', 'fake-kind k-' + (/xử lý/i.test(it.kind) ? 'dealt' : /giả mạo/i.test(it.kind) ? 'spoof' : 'deny'), it.kind || 'Cảnh báo'));
      if (it.official) tags.append(el('span', 'fake-official', 'Nguồn chính thức'));
      b.append(tags, el('span', 'fake-title', it.t), el('span', 'hot-meta', [it.s, when(it) && ago(when(it))].filter(Boolean).join(' · ')));
      b.addEventListener('click', () => open({ name: fk.label }, { ...it, d: when(it) }, 0, true));
      list.append(b);
    });
    hot.replaceChildren(top, list);
  }
  cats.forEach((c, i) => { const b = el('button', 'hub-tab', c.name); b.type = 'button'; b.setAttribute('role', 'tab'); b.addEventListener('click', () => render(i)); tabs.append(b); });
  if (fk) {
    fakeBtn = el('button', 'fake-btn'); fakeBtn.type = 'button'; fakeBtn.setAttribute('role', 'tab');
    const fresh = fk.items.filter((it) => Date.now() - Date.parse(when(it)) < 24 * 3600e3).length;
    fakeBtn.append(el('span', 'fake-tri', '!'), el('span', 'fake-name', fk.label));
    if (fresh) fakeBtn.append(el('span', 'fake-count', `${fresh} mới`));
    fakeBtn.addEventListener('click', renderFake);
    tabbar.append(fakeBtn);
  }
  render(0);

  /* ---- ý tưởng đề tài có thể thành trend: theo mục, mỗi sự kiện bung 3 ý tưởng, đổi lúc 12:00 và 21:00 ---- */
  const tcats = ((data.topics || {}).cats || []).filter((c) => c && Array.isArray(c.items) && c.items.some((i) => Array.isArray(i.ideas) && i.ideas.length));
  if (tcats.length) {
    const sec = el('section', 'hub-topics');
    const hd = el('div', 'topics-head');
    const hm = (iso) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? `${p2(d.getHours())}:${p2(d.getMinutes())} ngày ${p2(d.getDate())}/${p2(d.getMonth() + 1)}` : ''; };
    const stamp = [data.topics.at && `Bản lúc ${hm(data.topics.at)}`, data.topics.next && `đổi tiếp lúc ${hm(data.topics.next)}`].filter(Boolean).join(' · ');
    hd.append(el('h2', 'hub-title', 'Ý tưởng đề tài có thể thành trend'), el('p', '', 'Từ những sự kiện đang lên, gợi ý các đề tài và định dạng dễ lan truyền. Đổi hai lần mỗi ngày, lúc 12:00 và 21:00.'));
    const ttabs = el('div', 'hub-tabs topic-tabs'); ttabs.setAttribute('role', 'tablist');
    const grid = el('div', 'trend-grid');
    const show = (ci) => {
      [...ttabs.children].forEach((b, k) => b.setAttribute('aria-selected', k === ci ? 'true' : 'false'));
      grid.replaceChildren(...tcats[ci].items.filter((i) => i.ideas && i.ideas.length).map((ev) => {
        const card = el('article', 'trend');
        const top = el('div', 'trend-event');
        const lbl = el('p', 'trend-label'); lbl.append(el('span', 'kind', 'Sự kiện'), el('span', '', ev.n > 1 ? `${ev.n} báo · ${ev.k} bài` : 'Tin mới'));
        const h = el('h3'); h.append(ext(ev.story)); 
        top.append(lbl, h, el('p', 'trend-src', ev.story.s));
        const why = el('p', 'trend-why'); why.append(el('b', '', 'Vì sao có thể lan: '), document.createTextNode(ev.why));
        const ol = el('ol', 'trend-ideas');
        ev.ideas.forEach((d) => {
          const li = el('li');
          li.append(el('span', 'idea-h', d.h), el('span', 'idea-f', d.f));
          if (d.w) li.append(el('span', 'idea-w', d.w.charAt(0).toUpperCase() + d.w.slice(1) + '.'));
          ol.append(li);
        });
        card.append(top, why, ol);
        return card;
      }));
    };
    tcats.forEach((c, i) => { const b = el('button', 'hub-tab', c.name); b.type = 'button'; b.setAttribute('role', 'tab'); b.addEventListener('click', () => show(i)); ttabs.append(b); });
    show(0);
    sec.append(hd, ttabs, grid, el('p', 'topics-note', (stamp ? stamp + '. ' : '') + 'Gợi ý tạo tự động từ dòng tin của các báo nguồn: máy rút chủ thể của sự kiện và ghép với kho mẫu đề tài theo loại sự kiện. Hãy biên tập lại tiêu đề và kiểm tra thông tin trước khi triển khai.'));
    wrap.append(sec);
  }
  hub.append(wrap, dlg);
  hub.hidden = false;
  document.body.classList.add('has-hub');
})();
