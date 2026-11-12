// Công cụ ảnh dùng chung: nén ảnh về 2-3MB, đổi ảnh thành base64, tải ảnh (kể cả từ Drive).
// Dùng cho app.js (tiện ích và APK) và kho ảnh (kho.html).
function blobToB64(blob) {
  return new Promise((ok, bad) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result).split(',')[1]);
    fr.onerror = () => bad(fr.error);
    fr.readAsDataURL(blob);
  });
}

// CMS giới hạn 10MB và hạ tầng CMS chậm khi tải ảnh nặng nên ảnh được nén về khoảng 2-3MB.
const MAX_IMG_BYTES = 2.5 * 1024 * 1024;
const HARD_IMG_BYTES = 3 * 1024 * 1024;
async function shrinkImage(blob) {
  const bmp = await createImageBitmap(blob);
  let best = null;
  for (const side of [2000, 1600, 1200]) {
    for (const q of [0.85, 0.75, 0.65]) {
      const k = Math.min(1, side / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * k)); const h = Math.max(1, Math.round(bmp.height * k));
      const c = new OffscreenCanvas(w, h);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bmp, 0, 0, w, h);
      const out = await c.convertToBlob({ type: 'image/jpeg', quality: q });
      if (!best || out.size < best.size) best = out;
      if (out.size <= MAX_IMG_BYTES) return out;
    }
  }
  if (best && best.size <= HARD_IMG_BYTES) return best;
  throw new Error('không nén được ảnh xuống khoảng 2-3MB');
}

// Tải một ảnh (kể cả ảnh trên Drive, bằng phiên đăng nhập của trình duyệt) và chuẩn bị để đưa vào CMS.
// Ảnh trên Drive: thử lần lượt các địa chỉ tải ảnh (bản thu nhỏ 2000px trước), dùng phiên đăng nhập của trình duyệt.
function driveIdOf(src) {
  const m = /drive\.google\.com\/(?:uc\?(?:[^#]*&)?id=|file\/d\/|thumbnail\?(?:[^#]*&)?id=)([\w-]+)/.exec(src || '');
  return m ? m[1] : '';
}
async function fetchImageFile(src) {
  const id = driveIdOf(src);
  const urls = id
    ? [`https://drive.google.com/thumbnail?id=${id}&sz=w2000`, `https://drive.google.com/uc?export=view&id=${id}`, src]
    : [src];
  const reasons = [];
  for (const u of urls) {
    try {
      const res = await fetch(u, { credentials: id ? 'include' : 'omit', redirect: 'follow' });
      if (!res.ok) { reasons.push('máy chủ trả về ' + res.status); continue; }
      let blob = await res.blob();
      if (!/^image\//.test(blob.type)) { reasons.push('không phải ảnh (cần quyền xem trên Drive)'); continue; }
      if (blob.size > MAX_IMG_BYTES || !/image\/(jpeg|png)/.test(blob.type)) blob = await shrinkImage(blob);
      return { b64: await blobToB64(blob), mime: blob.type, ext: (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg') };
    } catch (e) { reasons.push(e.message); }
  }
  throw new Error(reasons.length ? reasons[0] : 'không tải được');
}

