# Dẫn bài vào CMS

Tiện ích cho Chrome/Edge/Cốc Cốc: dán link bài báo, tiện ích bóc tách tiêu đề, sapo, nội dung, ảnh rồi điền vào trang soạn bài của CMS đang đăng nhập sẵn trên trình duyệt.

## Cài đặt (một lần)

1. Tải thư mục `dan-bai-cms` về máy (hoặc giải nén tệp `dan-bai-cms.zip`).
2. Mở `chrome://extensions`, bật **Chế độ dành cho nhà phát triển** ở góc trên bên phải.
3. Bấm **Tải tiện ích đã giải nén** và chọn thư mục `dan-bai-cms`.
4. Ghim biểu tượng tiện ích lên thanh công cụ.

## Dùng hằng ngày

1. Đăng nhập CMS và mở trang **soạn bài mới**.
2. Bấm biểu tượng tiện ích (nếu đang xem bài báo, link được điền sẵn), hoặc dán link rồi bấm **Lấy bài**.
3. Đọc lại, sửa nếu cần, rồi bấm **Điền vào CMS**. Trình duyệt chuyển sang tab CMS với các ô đã điền.
4. Chọn chuyên mục, ảnh đại diện rồi bấm gửi duyệt trên CMS.

## Thiết lập CMS

- **Địa chỉ trang soạn bài mới**: mặc định `https://cms.phapluat.gov.vn/admin/`. Nên đổi thành đúng địa chỉ trang tạo bài để tiện ích tự mở khi chưa có tab CMS.
- **Chỉ định ô nhập**: tiện ích tự dò ô tiêu đề, sapo, nội dung. Nếu dò sai hoặc không thấy, bấm **Chỉ định** ở dòng tương ứng rồi bấm vào đúng ô đó trên CMS. Chỉ cần làm một lần.
- **Tự bấm nút gửi duyệt**: mặc định tắt. Muốn bật, hãy chỉ định nút gửi duyệt trước. Tiện ích chỉ bấm khi đã điền được cả tiêu đề và nội dung.

## Giới hạn

- Ảnh trong bài vẫn trỏ về máy chủ của báo gốc; tiện ích không tải ảnh lên kho ảnh của CMS.
- Chuyên mục, tag, ảnh đại diện cần chọn tay trên CMS.
- Chỉ dẫn lại bài khi tòa soạn có quyền sử dụng nội dung đó; dòng ghi nguồn kèm link gốc được thêm tự động ở cuối bài.

Thư viện bóc tách nội dung: [Mozilla Readability](https://github.com/mozilla/readability) (giấy phép Apache 2.0).
