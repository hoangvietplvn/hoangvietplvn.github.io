// Chạy trên trang CMS khi bấm dấu trang «Dán bài». Khi dựng bản web, tệp này được ghép sau cms-fill.js và moj-cms.js.
/* global danBaiFill, mojFill, mojCoverState, mojClickCover, mojAfterCover, mojSave, mojMediaUpload, mojMediaChoose */
(function () {
  const MARK = 'DANBAI1\n';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const run = (window.__danBaiRun = (window.__danBaiRun || 0) + 1);

  // ---- Thanh thông báo ----
  function bar(text, kind) {
    let el = document.getElementById('__danbai_bar');
    if (!el) {
      el = document.createElement('div');
      el.id = '__danbai_bar';
      el.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;padding:10px 14px;font:14px/1.45 system-ui,sans-serif;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.35);max-height:40vh;overflow:auto';
      const x = document.createElement('span');
      x.textContent = ' ✕';
      x.style.cssText = 'float:right;cursor:pointer;padding-left:12px';
      x.onclick = () => el.remove();
      el.append(x, document.createElement('span'));
      document.documentElement.append(el);
    }
    el.style.background = kind === 'err' ? '#b00020' : kind === 'ok' ? '#1b6e2f' : '#1d4f91';
    el.lastChild.textContent = 'Dán bài: ' + text;
  }

  // ---- Lấy bài: bộ nhớ tạm, hoặc dán tay vào hộp nếu trình duyệt không cho đọc ----
  function manualPaste() {
    return new Promise((resolve) => {
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px';
      box.innerHTML = '<div style="background:#fff;color:#111;border-radius:8px;padding:16px;max-width:520px;width:100%;font:14px system-ui,sans-serif"><p style="margin:0 0 8px"><b>Dán bài</b>: trình duyệt không cho đọc bộ nhớ tạm. Bấm giữ vào ô dưới, chọn Dán, rồi bấm Điền.</p><textarea style="width:100%;height:120px"></textarea><p style="margin:8px 0 0;text-align:right"><button data-x>Hủy</button> <button data-ok style="font-weight:700">Điền</button></p></div>';
      document.documentElement.append(box);
      const ta = box.querySelector('textarea');
      box.querySelector('[data-x]').onclick = () => { box.remove(); resolve(''); };
      box.querySelector('[data-ok]').onclick = () => { const v = ta.value; box.remove(); resolve(v); };
      ta.focus();
    });
  }
  async function readPayload() {
    let text = '';
    bar('đang đọc bài từ bộ nhớ tạm… nếu trình duyệt hỏi quyền, hãy bấm Cho phép.');
    try {
      text = await Promise.race([navigator.clipboard.readText(), new Promise((_, no) => setTimeout(() => no(new Error('quá hạn')), 12000))]);
    } catch (e) { text = ''; }
    if (!text.startsWith(MARK)) text = await manualPaste();
    if (!text) throw new Error('chưa có bài trong bộ nhớ tạm. Mở trang Dẫn bài, bấm «Điền vào CMS …» trước.');
    if (!text.startsWith(MARK)) throw new Error('nội dung trong bộ nhớ tạm không phải bài do trang Dẫn bài tạo ra.');
    return JSON.parse(text.slice(MARK.length));
  }

  const join = (names, r, val) => Object.keys(names).filter((k) => r[k] === val).map((k) => names[k]);

  // ---- CMS PLQG ----
  async function fillPlq(p) {
    if (document.querySelector('input[type=password]')) { bar('CMS đang ở trang đăng nhập. Hãy đăng nhập, vào trang quản lý bài viết rồi bấm dấu trang lại.', 'err'); return; }
    const data = p.data;
    if (data.coverFile === undefined && p.coverFile) data.coverFile = p.coverFile;
    bar('đang điền vào CMS PLQG…');
    const r = (await danBaiFill(data, {}, p.opts || {})) || {};
    const names = { title: 'tiêu đề', sapo: 'tóm tắt', body: 'nội dung', author: 'tác giả', date: 'ngày đăng', cover: 'ảnh đại diện', category: 'danh mục' };
    const done = join(names, r, true); const missed = join(names, r, false);
    const manual = Object.keys(names).filter((k) => r[k] === null && k !== 'sapo' && k !== 'author').map((k) => names[k]);
    let text = done.length ? 'Đã điền: ' + done.join(', ') + '.' : '';
    if (missed.length) text += ` Chưa điền được: ${missed.join(', ')}; hãy nhập tay (nếu chưa mở form «Tạo bài viết», mở rồi bấm dấu trang lại).`;
    if (done.length && manual.length) text += ` Cần tự làm trên CMS: ${manual.join(', ')}.`;
    if (done.length) text += ' Hãy kiểm tra rồi bấm lưu trên CMS.';
    if (r.notes && r.notes.length) text += ' ' + r.notes.join(' ');
    if (p.notes) text += ' ' + p.notes;
    if (r.images && r.images.ok) text += ` Đã chèn ${r.images.ok}/${(data.bodyImages || []).length} ảnh vào nội dung.`;
    if (r.images && r.images.fail && r.images.fail.length) text += ' Chưa chèn được: ' + r.images.fail.join('; ') + '.';
    bar(text.trim(), !done.length || missed.length ? 'err' : 'ok');
  }

  // ---- CMS Moj: trang soạn bài ----
  async function fillMoj(p) {
    if (document.querySelector('input[type=password]')) { bar('CMS đang ở trang đăng nhập. Hãy đăng nhập, mở «Thêm mới tin bài» rồi bấm dấu trang lại.', 'err'); return; }
    bar('đang điền vào CMS Moj…');
    const r = await mojFill(p.data, 15000);
    if (r.noForm || r.busy) { bar((r.notes || []).join(' ') || 'Không thấy form soạn bài.', 'err'); return; }
    const notes = [...(r.notes || [])];
    if (p.notes) notes.push(p.notes);
    let cover = null; let caption = null;
    if (p.coverFile) {
      const st = mojCoverState();
      if (st && st.has) {
        const a = await mojAfterCover(p.data.caption, 1500);
        cover = true; caption = a.caption === undefined ? null : a.caption;
        notes.push('CMS đã có ảnh đại diện nên giữ nguyên ảnh đó.');
      } else if (st && st.button) {
        bar('Đã điền chữ. Bấm «Chọn ảnh mới» trên CMS; khi cửa sổ kho ảnh hiện ra, bấm dấu trang «Dán bài» trong cửa sổ đó để tải ảnh đại diện lên. Trang này sẽ tự làm tiếp khi ảnh được chọn.');
        try { mojClickCover(); } catch (e) { /* trình duyệt có thể chặn cửa sổ; người dùng tự bấm */ }
        const t0 = Date.now();
        while (Date.now() - t0 < 10 * 60 * 1000) {
          await sleep(1000);
          const s = mojCoverState();
          if (s && s.has) break;
        }
        const a = await mojAfterCover(p.data.caption, 15000);
        cover = !!(a && a.cover); caption = a && a.caption === undefined ? null : (a && a.caption);
        if (!cover) notes.push('Ảnh đại diện: chưa thấy ảnh trên form.');
      } else notes.push('Ảnh đại diện: không thấy nút «Chọn ảnh mới».');
    }
    const res = { title: r.title, sapo: r.sapo, body: r.body, category: r.category, cover, caption };
    const names = { title: 'tiêu đề', sapo: 'tóm tắt', body: 'nội dung', cover: 'ảnh đại diện', caption: 'chú thích ảnh', category: 'chuyên mục chính' };
    const done = join(names, res, true); const missed = join(names, res, false);
    const manual = [];
    if (res.cover === null) manual.push('ảnh đại diện');
    if (res.category === null) manual.push('chuyên mục chính');
    let saved = null;
    if (p.opts && p.opts.autoSave && done.length) {
      if (missed.length) notes.push('Còn ô chưa điền được nên không tự bấm «Lưu và ở lại trang».');
      else saved = await mojSave().catch(() => false);
    }
    let text = done.length ? 'Đã điền: ' + done.join(', ') + '.' : '';
    if (missed.length) text += ` Chưa điền được: ${missed.join(', ')}; hãy nhập tay.`;
    if (done.length && manual.length) text += ` Cần tự làm trên CMS: ${manual.join(', ')}.`;
    if (saved === true) text += ' Đã bấm «Lưu và ở lại trang».';
    else if (saved === false) text += ' Chưa lưu được; hãy bấm «Lưu và ở lại trang» trên CMS.';
    else if (done.length) text += ' Hãy kiểm tra rồi bấm lưu trên CMS.';
    bar((text + ' ' + notes.join(' ')).trim(), !done.length || missed.length || saved === false ? 'err' : 'ok');
  }

  // ---- CMS Moj: cửa sổ kho ảnh ----
  async function mediaMoj(p) {
    if (!p.coverFile) { bar('Bài không có ảnh đại diện để tải lên.', 'err'); return; }
    bar('đang tải ảnh đại diện lên kho ảnh…');
    let up;
    try { up = await mojMediaUpload(p.coverFile); } catch (e) { up = { ok: false, why: e.message }; }
    if (!up || !up.ok) { bar('Chưa tải được ảnh lên kho (' + ((up && up.why) || 'không rõ lý do') + '). Hãy chọn ảnh tay.', 'err'); return; }
    await mojMediaChoose().catch(() => {});
    bar('Ảnh đã tải lên và được viền đỏ. Nếu cửa sổ chưa tự đóng, hãy bấm đúp vào ảnh đó để chọn làm ảnh đại diện.', 'ok');
  }

  (async () => {
    try {
      const p = await readPayload();
      if (Date.now() - (p.ts || 0) > 6 * 3600 * 1000) bar('Bài trong bộ nhớ tạm đã hơn 6 giờ; vẫn điền.');
      const h = location.hostname;
      const media = /^portalmedia\./i.test(h);
      if (p.kind === 'moj' || media) {
        if (!/moj\.gov\.vn$/i.test(h)) throw new Error('đây không phải trang của CMS Moj.');
        if (media) await mediaMoj(p); else await fillMoj(p);
      } else if (p.kind === 'plq') {
        if (!/phapluat\.gov\.vn$/i.test(h)) throw new Error('đây không phải trang của CMS PLQG. Bài trong bộ nhớ tạm dành cho CMS PLQG.');
        await fillPlq(p);
      } else throw new Error('không nhận ra loại bài.');
    } catch (e) {
      bar('Không điền được: ' + (e && e.message ? e.message : e), 'err');
    }
  })();
  void run;
})();
