# Bản web của «Dẫn bài vào CMS»

Địa chỉ sau khi đưa lên mạng: `https://hoangvietplvn.github.io/dan-bai/` (cài được như ứng dụng: «Thêm vào màn hình chính»).

## Cách hoạt động
1. Trang web lấy bài (link báo / Google Docs, hoặc dán nội dung), bạn sửa lại, rồi bấm **Điền vào CMS PLQG/Moj**.
2. Bài (kèm ảnh đã nén) được sao chép vào bộ nhớ tạm.
3. Bạn mở CMS (đã đăng nhập bằng Chrome/Safari của chính bạn) và bấm dấu trang **Dán bài**. Dấu trang chạy ngay trên trang CMS, đọc bộ nhớ tạm và điền form.

Mật khẩu CMS không đi qua trang web hay máy chủ nào. Không bao giờ bấm «Gửi kiểm duyệt» / «Công khai ngay».

## Cài một lần
1. Sau khi gộp nhánh vào `main`, GitHub Actions tự dựng bản web (`node tools/build-web.js` → `dist/dan-bai/`).
2. Mở trang, làm mục **Cài đặt lần đầu**: kéo nút «Dán bài» lên thanh dấu trang (máy tính) hoặc sao chép mã dấu trang (điện thoại).
3. Tuỳ chọn, để dán được link báo: dựng máy chủ lấy bài.

## Máy chủ lấy bài (Cloudflare Worker, miễn phí)
1. Vào dash.cloudflare.com → Workers & Pages → Create → Hello World, đặt tên `dan-bai-proxy`, Deploy, rồi Edit code và dán nội dung `worker/proxy.js`, Deploy.
2. Settings → Variables: `ALLOWED_ORIGINS` = `https://hoangvietplvn.github.io`; thêm secret `KEY` = một chuỗi bí mật tự đặt.
3. Điền địa chỉ `https://dan-bai-proxy.<tên>.workers.dev` và khóa vào mục Cài đặt lần đầu trên trang Dẫn bài (lưu trong trình duyệt từng thiết bị).

## Giới hạn đã biết
- Chưa thử trên CMS thật. Nếu CMS chặn tải mã từ bên ngoài (CSP) thì dấu trang báo «Không tải được mã Dán bài».
- Moj: bước ảnh đại diện cần bấm dấu trang lần nữa trong cửa sổ kho ảnh.
- Điện thoại: Chrome Android chạy dấu trang bằng cách gõ tên vào thanh địa chỉ; Safari iPhone chọn từ danh sách dấu trang. Safari có thể hỏi «Dán» khi đọc bộ nhớ tạm.
- Google Docs riêng tư không lấy được qua máy chủ; dùng ô «Dán nội dung» hoặc mở quyền «Bất kỳ ai có đường liên kết».
