// Tạm thời: xem RSS Trung tâm Xử lý tin giả và các RSS của Bộ Công an
const get = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; rss-reader)' } }); return { status: r.status, body: await r.text() }; };
const items = (xml) => [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map((m) => { const g = (n) => ((m[0].match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, 'i')) || [])[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); return `${g('pubDate')} | ${g('title')} | ${g('link')} | ${g('description').slice(0, 160)}`; });
(async () => {
  const t = await get('https://tingia.gov.vn/rss');
  console.log('DISC == tingia rss ' + t.status); console.log('DISC ' + t.body.replace(/\s+/g, ' ').slice(0, 700));
  items(t.body).forEach((x) => console.log('DISC    ' + x));
  const sm = await get('https://tingia.gov.vn/sitemap.xml'); console.log('DISC == tingia sitemap: ' + sm.body.replace(/\s+/g, ' ').slice(0, 900));
  const b = await get('https://bocongan.gov.vn/rss');
  const feeds = [...new Set([...b.body.matchAll(/href=["']([^"']*api\/rss\/\d+\.xml)["'][^>]*>([\s\S]{0,80}?)</gi)].map((m) => m[1] + ' | ' + m[2].replace(/<[^>]+>/g, '').trim()))];
  console.log('DISC == bocongan rss: ' + feeds.length); feeds.forEach((f) => console.log('DISC    ' + f));
  for (const f of feeds.filter((f) => /cảnh báo|tin giả|sai sự thật|phòng|lừa|tội phạm|an ninh mạng|thông báo|tin tức/i.test(f)).slice(0, 6)) {
    const u = new URL(f.split(' | ')[0], 'https://bocongan.gov.vn').href; const r = await get(u);
    console.log('DISC == ' + f + ' → ' + r.status); items(r.body).slice(0, 6).forEach((x) => console.log('DISC    ' + x));
  }
  const m = await get('https://mst.gov.vn/latest-news-sitemap.xml');
  const locs = [...m.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1]);
  console.log('DISC == mst latest: ' + locs.length + ' url; khớp tin giả: ' + locs.filter((l) => /tin-gia|sai-su-that|canh-bao|mao-danh|gia-mao/.test(l)).slice(0, 10).join(' '));
})().catch((e) => console.log('DISC lỗi ' + e.message));
