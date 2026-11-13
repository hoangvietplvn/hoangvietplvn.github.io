// Tạm thời: dò địa chỉ RSS của các báo (chạy trong GitHub Actions rồi xoá)
const sites = ['nhandan.vn', 'baotintuc.vn', 'baochinhphu.vn', 'cand.com.vn', 'baophapluat.vn', 'dantri.com.vn', 'vnexpress.net'];
const paths = ['/rss', '/rss.html', '/rss/', '/rss.htm', '/rss.aspx', '/'];
const get = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(15000), redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; rss-reader)' } }); return { ok: r.ok, status: r.status, url: r.url, body: await r.text() }; };
(async () => {
  for (const site of sites) {
    const found = new Map();
    for (const p of paths) {
      try {
        const r = await get(`https://${site}${p}`);
        console.log(`DISC ${site}${p} → ${r.status} ${r.url} (${r.body.length} ký tự)`);
        if (!r.ok) continue;
        for (const m of r.body.matchAll(/<a[^>]+href=["']([^"']*(?:\.rss|\/rss\/|rss\.|\/feed)[^"']*)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
          const u = new URL(m[1], r.url).href;
          if (!found.has(u)) found.set(u, m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50));
        }
        for (const m of r.body.matchAll(/<link[^>]+type=["']application\/rss\+xml["'][^>]*>/gi)) { const h = m[0].match(/href=["']([^"']+)/); if (h) { const u = new URL(h[1], r.url).href; if (!found.has(u)) found.set(u, '(link rel)'); } }
        for (const m of r.body.matchAll(/https?:\/\/[^\s"'<>]+\.rss/gi)) if (!found.has(m[0])) found.set(m[0], '(text)');
      } catch (e) { console.log(`DISC ${site}${p} → lỗi ${e.message}`); }
    }
    const want = /thoi-?su|chinh-?tri|the-?gioi|quoc-?te|phap-?luat|xa-?hoi|khoa-?hoc|cong-?nghe|so-?hoa|home|trang-?chu|tin-?moi|doi-?song|an-?ninh|khoa-?giao|chinh-?sach/i;
    const list = [...found].filter(([u, t]) => want.test(u) || want.test(t));
    console.log(`DISC == ${site}: ${found.size} liên kết RSS, ${list.length} phù hợp`);
    for (const [u, t] of (list.length ? list : [...found]).slice(0, 70)) console.log(`DISC    ${u}  |  ${t}`);
  }
})();
