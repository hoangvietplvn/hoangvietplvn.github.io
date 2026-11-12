# Dẫn bài vào CMS

Tiện ích cho Chrome/Edge/Cốc Cốc: dán link bài báo, tiện ích bóc tách bài rồi điền vào form «Tạo bài viết» của CMS (cms.phapluat.gov.vn, nền Directus) đang đăng nhập sẵn trên trình duyệt.

## Cài đặt

1. Giải nén `dan-bai-cms.zip` (hoặc tải thư mục `dan-bai-cms`).
2. Mở `chrome://extensions`, bật **Chế độ dành cho nhà phát triển**.
3. Bấm **Tải tiện ích đã giải nén** và chọn thư mục `dan-bai-cms`.

Cập nhật bản mới: chép đè thư mục cũ rồi bấm nút tải lại (mũi tên tròn) ở ô tiện ích trong `chrome://extensions`. Sau đó chỉ định lại ô Tiêu đề và Tóm tắt.

## Dùng hằng ngày

1. Đăng nhập CMS, mở trang quản lý bài viết (ví dụ mục «Chờ phê duyệt»).
2. Bấm biểu tượng tiện ích, dán link, bấm **Lấy bài**.
3. Đọc lại; sửa ô **Tác giả** (mặc định «Theo [tên nguồn]»), gõ **Danh mục** đúng như tên trên CMS (tiện ích nhớ cho lần sau).
4. Bấm **Điền vào CMS**. Tiện ích tự bấm nút **+** nếu form chưa mở, rồi điền:
   - Tiêu đề (Tiếng Việt), Tóm tắt (Tiếng Việt), Nội dung (Tiếng Việt), Tác giả
   - Ngày đăng: thời điểm hiện tại
   - Hình ảnh đại diện: tiện ích tự tải ảnh của bài gốc rồi đẩy lên ô Hình ảnh đại diện (không cần tải về máy)
   - Danh mục: mở hộp «Chọn Bản Ghi», chọn dòng có tên trùng với ô Danh mục (mặc định «Tin hoạt động») rồi bấm dấu tích
5. Kiểm tra trên CMS rồi bấm **Lưu**.

Dòng thông báo cạnh nút cho biết ô nào đã điền, ô nào chưa điền được cần nhập tay.

## Thiết lập CMS

- **Thao tác với lịch và danh mục**: tiện ích bấm vào nút ô Ngày đăng và ô Danh mục (như bạn bấm tay một lần), rồi chọn «Set to Now» hoặc dòng THD «Tin hoạt động».
- **Chỉ định ô**: tiện ích tìm ô theo tên trên form (ví dụ «Tiêu đề (Tiếng Việt)»). Nếu ô nào không tìm thấy, mở form «Tạo bài viết», bấm **Chỉ định** ở dòng tương ứng rồi bấm vào đúng ô trên CMS. Bản 1.3.0 bỏ các chỉ định cũ vì chúng có thể trỏ nhầm; hãy chỉ định lại tiêu đề và tóm tắt một lần.
- **Tự bấm nút lưu**: mặc định tắt. Muốn bật, chỉ định nút (Lưu hoặc Gửi phê duyệt) trước. Tiện ích chỉ bấm khi mọi ô đều điền được.
- **Sao chép thông tin chẩn đoán**: khi tiện ích điền sai, mở form «Tạo bài viết», bấm nút này và gửi kết quả cho người hỗ trợ. Chỉ gồm cấu trúc form, không kèm nội dung bài.

## Giới hạn

- Ảnh trong thân bài vẫn trỏ về máy chủ của báo gốc.
- Chú thích ảnh đại diện, tag, các tab Multimedia và SEO cần làm tay.
- Sau khi tải ảnh lên, CMS có thể mở bảng «Edit» để sửa tiêu đề và mô tả ảnh (thường là chú thích từ bài gốc); tiện ích chưa tự làm bước này.
- Chỉ dẫn lại bài khi tòa soạn có quyền sử dụng nội dung đó.

Thư viện bóc tách nội dung: [Mozilla Readability](https://github.com/mozilla/readability) (giấy phép Apache 2.0).
