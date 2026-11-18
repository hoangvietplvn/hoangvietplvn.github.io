// Máy chủ lấy bài (Cloudflare Worker, gói miễn phí). Trang Dẫn bài gửi link báo/ảnh tới đây, máy chủ tải về rồi trả lại
// kèm tiêu đề cho phép trình duyệt đọc. Không đăng nhập hộ ai, không lưu gì.
//   Biến cấu hình (Settings → Variables):
//     ALLOWED_ORIGINS  các trang được dùng, cách nhau dấu phẩy. Mặc định https://hoangvietplvn.github.io
//     KEY              (tuỳ chọn, nên đặt) khóa bí mật; trang Dẫn bài gửi kèm ?key=… để người lạ không dùng ké được.
const MAX_BYTES = 15 * 1024 * 1024;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export default {
  async fetch(req, env) {
    const allowed = String(env.ALLOWED_ORIGINS || 'https://hoangvietplvn.github.io').split(',').map((s) => s.trim()).filter(Boolean);
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
      'Access-Control-Expose-Headers': 'x-final-url, content-type',
      Vary: 'Origin',
    };
    const fail = (status, msg) => new Response(msg, { status, headers: { ...cors, 'content-type': 'text/plain; charset=utf-8' } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    if (req.method !== 'GET') return fail(405, 'Chỉ nhận GET');
    if (origin && !allowed.includes(origin)) return fail(403, 'Trang này không được phép dùng máy chủ');

    const q = new URL(req.url).searchParams;
    if (env.KEY && q.get('key') !== env.KEY) return fail(401, 'Sai khóa');
    let target;
    try { target = new URL(q.get('url') || ''); } catch (e) { return fail(400, 'Thiếu hoặc sai tham số url'); }
    if (!/^https?:$/.test(target.protocol)) return fail(400, 'Chỉ nhận http/https');
    const h = target.hostname;
    if (/^(localhost|.*\.local|.*\.internal)$/i.test(h) || /^[\d.]+$/.test(h) || h.includes(':')) return fail(400, 'Địa chỉ không hợp lệ');

    let up;
    try {
      up = await fetch(target.toString(), { redirect: 'follow', headers: { 'user-agent': UA, accept: '*/*', 'accept-language': 'vi,en;q=0.8' } });
    } catch (e) { return fail(502, 'Không kết nối được trang nguồn'); }
    const len = Number(up.headers.get('content-length') || 0);
    if (len > MAX_BYTES) return fail(413, 'Tệp quá lớn');
    const buf = await up.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return fail(413, 'Tệp quá lớn');
    return new Response(buf, {
      status: up.status,
      headers: { ...cors, 'content-type': up.headers.get('content-type') || 'application/octet-stream', 'x-final-url': up.url || target.toString(), 'cache-control': 'no-store' },
    });
  },
};
