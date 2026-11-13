// Tạm thời: xem cấu trúc HTML quanh phần mở đầu bài của Báo Tin tức và CAND
const get = async (u) => (await fetch(u, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; rss-reader)' } })).text();
(async () => {
  for (const feed of ['https://baotintuc.vn/rss/the-gioi-130.rss', 'https://cand.vn/rss/quoc-te-1440.rss', 'https://nhandan.vn/rss/thegioi-1231.rss', 'https://baochinhphu.vn/quoc-te.rss']) {
    try {
      const xml = await get(feed);
      const link = (xml.match(/<item[\s\S]*?<link>(?:<!\[CDATA\[)?\s*(https?:[^\]<\s]+)/i) || [])[1];
      const html = (await get(link)).replace(/<(script|style)[\s>][\s\S]*?<\/\1>/gi, '').replace(/\s+/g, ' ');
      const i = html.search(/<h1[\s>]/i);
      console.log('DBG == ' + link);
      const seg = html.slice(i, i + 9000).replace(/<img[^>]*>/g, '<img>').replace(/(href|src|data-[a-z-]+|style|onclick|title|alt)="[^"]*"/g, '$1=""');
      for (let k = 0; k < seg.length; k += 900) console.log('DBG ' + seg.slice(k, k + 900));
    } catch (e) { console.log('DBG lỗi ' + feed + ' ' + e.message); }
  }
})();
