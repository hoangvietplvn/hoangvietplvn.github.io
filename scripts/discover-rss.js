// Tạm thời: thử các địa chỉ nguồn tin có thể có của Báo Pháp luật và Báo Chính phủ
const get = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(15000), redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; rss-reader)' } }); return { ok: r.ok, status: r.status, url: r.url, type: r.headers.get('content-type') || '', body: await r.text() }; };
const cands = [
  ...['/rss/home.rss', '/home.rss', '/rss/trang-chu.rss', '/rss/thoi-su.rss', '/thoi-su.rss', '/rss/phap-luat.rss', '/phap-luat.rss', '/feed', '/rss.xml', '/feed.xml', '/robots.txt', '/sitemap.xml', '/sitemaps/news.xml', '/sitemap-news.xml', '/news-sitemap.xml', '/sitemaps.xml', '/sitemap/news.xml', '/google-news.xml', '/sitemaps/google-news.xml', '/sitemaps/latest-news.xml'].map((p) => 'https://baophapluat.vn' + p),
  ...['/home.rss', '/chinh-tri.rss', '/thoi-su.rss', '/quoc-te.rss', '/xa-hoi.rss', '/phap-luat.rss', '/khoa-giao.rss', '/khoa-hoc-cong-nghe.rss', '/kinh-te.rss', '/chinh-sach-moi.rss', '/chinh-sach-va-cuoc-song.rss', '/rss'].map((p) => 'https://baochinhphu.vn' + p),
  'https://vnexpress.net/rss/doi-song.rss', 'https://cand.vn/rss.html',
];
(async () => {
  for (const u of cands) {
    try {
      const r = await get(u);
      const items = (r.body.match(/<item[\s>]/g) || []).length, urls = (r.body.match(/<url>/g) || []).length, maps = (r.body.match(/<sitemap>/g) || []).length;
      console.log(`DISC ${r.status} ${u} → ${r.url !== u ? r.url + ' ' : ''}[${r.type.split(';')[0]}] ${r.body.length} ký tự, item=${items} url=${urls} sitemap=${maps}`);
      if (/robots\.txt$/.test(u)) r.body.split('\n').filter((l) => /sitemap|rss/i.test(l)).slice(0, 15).forEach((l) => console.log('DISC    ' + l.trim()));
      if (maps || (urls && /sitemap/.test(u))) console.log('DISC    ' + r.body.replace(/\s+/g, ' ').slice(0, 900));
      if (items && /baochinhphu|baophapluat/.test(u)) console.log('DISC    ' + (r.body.match(/<item[\s>][\s\S]{0,500}/) || [''])[0].replace(/\s+/g, ' '));
      if (/baochinhphu\.vn\/rss$|cand\.vn\/rss\.html/.test(u)) for (const m of r.body.matchAll(/href=["']([^"']*\.rss)["'][^>]*>([\s\S]{0,80}?)</gi)) console.log('DISC    ' + m[1] + ' | ' + m[2].replace(/<[^>]+>/g, '').trim());
    } catch (e) { console.log(`DISC lỗi ${u}: ${e.message}`); }
  }
  // trang chuyên mục của Báo Pháp luật: xem cấu trúc liên kết bài
  for (const p of ['/', '/thoi-su', '/phap-luat', '/quoc-te', '/xa-hoi', '/khoa-hoc-cong-nghe', '/chuyen-muc/thoi-su.html', '/thoi-su.html']) {
    try {
      const r = await get('https://baophapluat.vn' + p);
      const links = [...r.body.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
      const art = [...new Set(links.filter((h) => /\.html$|post\d+|-\d{5,}/.test(h)))];
      console.log(`DISC ${r.status} bpl ${p} → ${r.url} ${r.body.length} ký tự, ${art.length} liên kết bài`);
      if (p === '/') { console.log('DISC    menu: ' + [...new Set(links.filter((h) => /^\/[a-z0-9-]+\/?$|baophapluat\.vn\/[a-z0-9-]+\/?$/.test(h)))].slice(0, 40).join(' ')); console.log('DISC    mẫu bài: ' + art.slice(0, 6).join(' ')); const j = r.body.match(/<article[\s\S]{0,700}/); console.log('DISC    article: ' + (j ? j[0].replace(/\s+/g, ' ') : 'không có thẻ article')); console.log('DISC    time: ' + [...r.body.matchAll(/<time[^>]*>[\s\S]{0,60}/gi)].slice(0, 3).map((m) => m[0].replace(/\s+/g, ' ')).join(' || ')); }
    } catch (e) { console.log(`DISC lỗi bpl ${p}: ${e.message}`); }
  }
})();
