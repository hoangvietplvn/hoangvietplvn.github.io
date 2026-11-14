// Tạm thời: xem cách trang VAFC ghi ngày đăng
const get = async (u) => (await fetch(u, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; rss-reader)' } })).text();
(async () => {
  for (const u of ['https://tingia.gov.vn/gia-mao-cac-cuoc-thi-trang-nguyen-tieng-viet-de-lua-dao.html', 'https://tingia.gov.vn/lan-truyen-cac-video-khong-ro-nguon-goc-de-gay-ton-hai-den-uy-tin-cua-suntory-pepsico-viet-nam.html']) {
    const h = await get(u);
    console.log('DISC == ' + u + ' ' + h.length);
    for (const m of h.matchAll(/.{0,160}(\d{1,2}[\/-]\d{1,2}[\/-]20\d\d|20\d\d-\d\d-\d\d|published|datePublished|ngày đăng|cập nhật).{0,160}/gi)) console.log('DISC    ' + m[0].replace(/\s+/g, ' '));
  }
  const sm = await get('https://tingia.gov.vn/sitemap.xml');
  console.log('DISC == sitemap'); [...sm.matchAll(/<url>[\s\S]*?<\/url>/g)].slice(0, 12).forEach((m) => console.log('DISC    ' + m[0].replace(/\s+/g, ' ').slice(0, 220)));
})().catch((e) => console.log('DISC lỗi ' + e.message));
