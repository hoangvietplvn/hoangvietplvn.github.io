// Dựng bản web của công cụ Dẫn bài vào dist/dan-bai/ (chạy sau `npm run build`).
// Dùng chung mã với tiện ích Chrome và ứng dụng Android (tools/dan-bai-cms); chỉ thêm lớp web-shim.js và runner.js.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'dan-bai-cms');
const OUT = path.join(__dirname, '..', 'dist', 'dan-bai');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const copy = (from, to) => { fs.mkdirSync(path.dirname(path.join(OUT, to)), { recursive: true }); fs.copyFileSync(path.join(SRC, from), path.join(OUT, to)); };

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const f of ['app.css', 'app.js', 'extract.js', 'imgtools.js', 'web-shim.js', 'lib/Readability.js']) copy(f, f);
for (const f of ['sw.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png']) copy('web/' + f, f);

let html = read('app.html');
html = html.replace('<link rel="stylesheet" href="app.css">',
  '<link rel="stylesheet" href="app.css">\n<link rel="manifest" href="manifest.webmanifest">\n<meta name="theme-color" content="#a61b1b">\n<link rel="icon" href="icon-192.png">\n<link rel="apple-touch-icon" href="icon-192.png">');
html = html.replace('<script src="shim.js"></script>', '<script src="web-shim.js"></script>');
if (!html.includes('web-shim.js')) throw new Error('app.html đổi cấu trúc: không thay được shim.js');
fs.writeFileSync(path.join(OUT, 'index.html'), html);

// Mã chạy trên trang CMS: hàm điền của hai CMS + phần điều phối.
// Đổi mọi ký tự ngoài ASCII thành \uXXXX để mã chạy đúng trên trang CMS dù trang đó khai báo bảng mã nào.
const ascii = (s) => s.replace(/[^\x00-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
fs.writeFileSync(path.join(OUT, 'runner.js'), ascii([read('cms-fill.js'), read('moj-cms.js'), fs.readFileSync(path.join(SRC, 'web/runner.js'), 'utf8')].join('\n;\n')));
console.log('Đã dựng bản web vào', path.relative(process.cwd(), OUT));
