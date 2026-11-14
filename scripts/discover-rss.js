// Tạm thời: xem các sơ đồ trang chuyên mục của VAFC, tin nào mới nhất
const get = async (u) => (await fetch(u, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; rss-reader)' } })).text();
(async () => {
  const idx = await get('https://tingia.gov.vn/sitemap.xml');
  const maps = [...idx.matchAll(/<loc>(https:\/\/tingia\.gov\.vn\/sitemap\/[^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const m of maps) {
    try {
      const x = await get(m);
      const urls = [...x.matchAll(/<url>[\s\S]*?<\/url>/g)].map((u) => ({ loc: (u[0].match(/<loc>([^<]+)/) || [])[1], mod: (u[0].match(/<lastmod>([^<]+)/) || [])[1] }));
      const sorted = urls.filter((u) => u.mod).sort((a, b) => b.mod.localeCompare(a.mod));
      console.log(`DISC == ${m}: ${urls.length} url, mới nhất ${sorted[0] ? sorted[0].mod : '-'}`);
      sorted.slice(0, 4).forEach((u) => console.log(`DISC    ${u.mod} ${u.loc}`));
    } catch (e) { console.log('DISC lỗi ' + m + ' ' + e.message); }
  }
  const home = await get('https://tingia.gov.vn/');
  console.log('DISC == trang chủ, các ngày xuất hiện: ' + [...new Set([...home.matchAll(/(\d{2}\/\d{2}\/20\d\d) - \d{2}:\d{2}/g)].map((m) => m[1]))].slice(0, 20).join(', '));
})().catch((e) => console.log('DISC lỗi ' + e.message));
