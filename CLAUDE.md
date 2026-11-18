# Ghi chú cho Claude (đọc đầu mỗi phiên)

Kho này là blog (nhánh `main`) và công cụ **Dẫn bài vào CMS** của người dùng (nhánh `claude/dan-bai-2cms-app`). Người dùng nói tiếng Việt: trả lời bằng tiếng Việt, ngắn gọn, nói rõ cái gì đã thử được và cái gì chưa.

Phiên đã làm công cụ này: https://claude.ai/code/session_01YK2NaAgQRz7QLJyHA7qiii (nếu có công cụ xem phiên khác thì đọc khi cần biết lý do chi tiết).

## Công cụ làm gì

Dán link bài báo hoặc Google Docs → bóc tách tiêu đề, sapo, nội dung, ảnh → điền vào form soạn bài của hai CMS đang đăng nhập sẵn:

- **CMS PLQG**: Cổng Pháp luật quốc gia, `cms.phapluat.gov.vn` (Directus + TinyMCE). Mã điền: `tools/dan-bai-cms/cms-fill.js`, chọn ô tay: `cms-pick.js`.
- **CMS Moj**: Cổng thông tin điện tử Bộ Tư pháp, `moj.gov.vn/cms/nghiep-vu/quan-ly-tin-tuc/chinh-sua-bai-viet` (Blazor + Fluent UI + TinyMCE 7; ảnh đại diện chọn qua cửa sổ kho ảnh `portalmedia.moj.gov.vn`). Mã điền: `tools/dan-bai-cms/moj-cms.js`.

Hai bản chạy: tiện ích Chrome (`tools/dan-bai-cms`) và ứng dụng Android (`android/`, bốn tab Kéo bài / Kho ảnh / PLQG / Moj). Android dùng chung mã giao diện; `tools/dan-bai-cms/shim.js` thay các API `chrome.*` bằng cầu nối gốc (`NativeBridge.kt`, `MainActivity.kt`). Thư mục assets của APK được sao chép từ `tools/dan-bai-cms` khi build, không commit.

**Bản web (GitHub Pages, `/dan-bai/`)**: dùng được trên iPhone/Mac/mọi trình duyệt. Dựng bởi `tools/build-web.js` (chạy trong `deploy.yml` sau `npm run build`, ra `dist/dan-bai/`, không commit). Dùng chung `app.js`/`extract.js`; `web-shim.js` thay `chrome.*` và bắt nút «Điền vào CMS …» thành «chuyển giao»: sao chép gói `DANBAI1\n{json}` vào bộ nhớ tạm. Dấu trang «Dán bài» chạy `runner.js` (= `cms-fill.js` + `moj-cms.js` + `web/runner.js`, đổi ký tự ngoài ASCII thành \\uXXXX) ngay trên trang CMS đã đăng nhập, đọc bộ nhớ tạm rồi điền. Mật khẩu CMS không rời trình duyệt của người dùng. Lấy bài từ link cần proxy `web/worker/proxy.js` (Cloudflare Worker); không có thì dùng ô «Dán nội dung». Chưa thử trên CMS thật; rủi ro chính: CMS chặn tải mã ngoài bằng CSP (khi đó cần nhúng mã trực tiếp vào dấu trang).

Các file chính: `app.js` (giao diện + điều phối hai nút điền), `extract.js` (bóc tách bài, làm sạch HTML, gỡ link, căn giữa ảnh), `imgtools.js` (nén/tải ảnh).

## Quy ước người dùng đã chốt (không tự đổi)

- Hai nút riêng: «Điền vào CMS PLQG» và «Điền vào CMS Moj». Ô Tác giả và chuyên mục tách riêng cho từng CMS.
- Ảnh đại diện = ảnh mở đầu bài (không có thì og:image). Với Moj, ảnh mở đầu và chú thích của nó bị bỏ khỏi nội dung; chú thích đó điền vào «Chú thích ảnh đại diện».
- Gỡ mọi hyperlink trong nội dung (trừ dòng «Theo …» do người dùng bật).
- Ảnh trong bài căn giữa; chú thích ảnh căn giữa và in nghiêng.
- Moj: «Tít phụ» để trống; Tác giả ghi thành dòng cuối bài; không đụng lịch xuất bản, tin nóng, chuyên mục phụ.
- **Không bao giờ tự bấm «Gửi kiểm duyệt» hay «Công khai ngay».** Chỉ «Lưu và ở lại trang», và chỉ khi người dùng bật tùy chọn tự lưu.
- Không ghi đè bài khác đang soạn dở trên form Moj. Moj bị treo thì tự tải lại trang (tối đa 2 lần).
- Moj, ảnh đại diện: mở cửa sổ kho ảnh → bấm thư mục «Default» trước (nút tải lên chỉ hiện sau đó) → bấm nút tải lên → chọn tệp → chọn ảnh vừa tải.

## Kiểm thử

Không có truy cập CMS thật và không mở được trang báo từ môi trường Claude (mạng bị chặn, CMS cần đăng nhập). Trước đây thử bằng trang giả lập + Playwright nạp tiện ích; kết quả trên giả lập không bảo đảm chạy trên CMS thật, nên khi báo cáo phải nói rõ. Khi CMS điền sai: nút «Sao chép thông tin chẩn đoán» trong Thiết lập CMS cho cấu trúc trang để sửa theo.

## Build và phát hành

- APK: GitHub Actions `.github/workflows/android-apk.yml` (chạy khi push vào `android/**` hoặc `tools/dan-bai-cms/**`), artifact `dan-bai-cms-apk`. Mỗi lần build là APK debug khóa ký khác nhau → người dùng phải gỡ bản cũ trước khi cài.
- Khi đổi tính năng: tăng phiên bản ở `tools/dan-bai-cms/manifest.json` và `android/app/build.gradle.kts` (versionCode/versionName), cập nhật README liên quan.
- Tiện ích Chrome gửi người dùng dạng zip của thư mục `tools/dan-bai-cms` (bỏ `kho.html`, `kho.js` vì chỉ dùng cho Android). Người dùng cài bằng «Tải tiện ích đã giải nén», cập nhật bằng giải nén đè rồi bấm tải lại.
