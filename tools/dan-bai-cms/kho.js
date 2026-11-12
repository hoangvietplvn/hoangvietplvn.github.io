// Trang kho ảnh (chỉ dùng trong ứng dụng Android). Dùng DanBaiStore từ shim.js và công cụ ảnh từ imgtools.js.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => (n / (1024 * 1024)).toFixed(2) + ' MB';
  let confirmClear = false;

  function setMsg(text, kind) { $('msg').textContent = text; $('msg').className = 'status' + (kind ? ' ' + kind : ''); }

  function render() {
    const items = window.DanBaiStore.list();
    const total = items.reduce((t, x) => t + (x.size || 0), 0);
    $('sum').textContent = items.length ? `${items.length} ảnh · ${fmt(total)}` : 'Kho đang trống.';
    const list = $('list');
    list.innerHTML = '';
    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'item';
      const img = document.createElement('img');
      img.alt = '';
      try { img.src = `data:${it.mime};base64,${window.DanBaiStore.readB64(it.id)}`; } catch (e) { /* bỏ qua ảnh lỗi */ }
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = `<b>${esc(it.name)}</b><br>${fmt(it.size || 0)}<br>${esc(it.source ? it.source : 'từ điện thoại')}`;
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = 'Xóa';
      del.onclick = () => { window.DanBaiStore.remove(it.id); render(); };
      row.append(img, meta, del);
      list.appendChild(row);
    }
  }

  $('pick').onchange = async (e) => {
    const files = Array.from(e.target.files || []);
    let done = 0;
    for (const f of files) {
      try {
        let blob = f;
        if (blob.size > MAX_IMG_BYTES || !/image\/(jpeg|png)/.test(blob.type)) blob = await shrinkImage(blob);
        const b64 = await blobToB64(blob);
        const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        window.DanBaiStore.add(f.name.replace(/\.[^.]+$/, '') + '.' + ext, blob.type, b64, '');
        done++;
        setMsg(`Đã thêm ${done}/${files.length} ảnh.`, 'ok');
      } catch (err) {
        setMsg('Không thêm được ' + f.name + ': ' + err.message, 'err');
      }
    }
    e.target.value = '';
    render();
  };

  $('clear').onclick = () => {
    if (!confirmClear) {
      confirmClear = true;
      $('clear').textContent = 'Bấm lần nữa để xóa tất cả';
      setTimeout(() => { confirmClear = false; $('clear').textContent = 'Xóa tất cả'; }, 4000);
      return;
    }
    confirmClear = false;
    $('clear').textContent = 'Xóa tất cả';
    window.DanBaiStore.clear();
    setMsg('Đã xóa kho.', 'ok');
    render();
  };

  render();
})();
