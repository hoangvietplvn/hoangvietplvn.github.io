// Tạm thời: dò nguồn cảnh báo tin giả chính thức
const get = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(20000), redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; rss-reader)' } }); return { status: r.status, url: r.url, type: (r.headers.get('content-type') || '').split(';')[0], body: await r.text() }; };
const urls = [
  'https://tingia.gov.vn/', 'https://tingia.gov.vn/rss', 'https://tingia.gov.vn/rss.html', 'https://tingia.gov.vn/feed', 'https://tingia.gov.vn/robots.txt', 'https://tingia.gov.vn/sitemap.xml',
  'https://bocongan.gov.vn/', 'https://bocongan.gov.vn/rss', 'https://bocongan.gov.vn/robots.txt',
  'https://mst.gov.vn/', 'https://mst.gov.vn/rss', 'https://mst.gov.vn/robots.txt',
  'https://baochinhphu.vn/rss', 'https://nhandan.vn/rss.html', 'https://cand.vn/rss.html', 'https://baotintuc.vn/rss.html', 'https://vnexpress.net/rss', 'https://dantri.com.vn/rss.htm',
];
(async () => {
  for (const u of urls) {
    try {
      const r = await get(u);
      const items = (r.body.match(/<item[\s>]/g) || []).length, arts = (r.body.match(/<article[\s>]/g) || []).length;
      console.log(`DISC ${r.status} ${u} → ${r.url} [${r.type}] ${r.body.length} ký tự, item=${items} article=${arts}`);
      if (/robots\.txt$/.test(u)) r.body.split('\n').filter((l) => /sitemap|rss/i.test(l)).slice(0, 8).forEach((l) => console.log('DISC    ' + l.trim()));
      // liên kết RSS và liên kết có chữ tin giả / cảnh báo / sai sự thật
      const seen = new Set();
      for (const m of r.body.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]{0,160}?)<\/a>/gi)) {
        const t = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const href = m[1];
        if (!(/\.rss|\/rss\/|feed/i.test(href) || /tin giả|tin-gia|sai sự thật|sai-su-that|cảnh báo|canh-bao|bác bỏ|xử lý tin|xu-ly-tin|phản bác|mạo danh|thông tin xấu|xau-doc|lừa đảo/i.test(href + ' ' + t))) continue;
        let abs = href; try { abs = new URL(href, r.url).href; } catch (e) {}
        if (seen.has(abs)) continue; seen.add(abs);
        if (seen.size > 40) break;
        console.log(`DISC    ${abs}  |  ${t.slice(0, 80)}`);
      }
      if (/tingia\.gov\.vn\/$/.test(u)) { const a = r.body.match(/<article[\s\S]{0,1200}/i); console.log('DISC    ARTICLE: ' + (a ? a[0].replace(/\s+/g, ' ').slice(0, 1200) : 'không có thẻ article')); console.log('DISC    HEAD: ' + r.body.replace(/\s+/g, ' ').slice(0, 600)); }
    } catch (e) { console.log(`DISC lỗi ${u}: ${e.message}`); }
  }
})();
