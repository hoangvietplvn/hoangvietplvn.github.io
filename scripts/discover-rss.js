// Tạm thời: xem danh sách chuyên mục và cấu trúc trang chuyên mục của Báo Pháp luật
const get = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; rss-reader)' } }); return { status: r.status, body: await r.text() }; };
(async () => {
  const home = await get('https://baophapluat.vn/');
  const seen = new Set();
  for (const m of home.body.matchAll(/<a[^>]+href=["'](\/chuyen-muc\/[^"']+)["'][^>]*>([\s\S]{0,100}?)<\/a>/gi)) { if (seen.has(m[1])) continue; seen.add(m[1]); console.log('DISC ' + m[1] + ' | ' + m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()); }
  const cat = await get('https://baophapluat.vn/chuyen-muc/thoi-su-chinh-tri.html');
  const arts = [...cat.body.matchAll(/<article[\s\S]*?<\/article>/gi)];
  console.log(`DISC trang chuyên mục: ${cat.status}, ${arts.length} thẻ article`);
  arts.slice(0, 3).forEach((a) => console.log('DISC ART ' + a[0].replace(/\s+/g, ' ').slice(0, 1500)));
})().catch((e) => console.log('DISC lỗi ' + e.message));
