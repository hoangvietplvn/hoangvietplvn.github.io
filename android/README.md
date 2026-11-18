# Dẫn bài CMS — ứng dụng Android (APK)

Ứng dụng dùng chung giao diện và logic với tiện ích Chrome (`tools/dan-bai-cms`), điền bài vào hai CMS: Cổng Pháp luật quốc gia (PLQG) và Cổng thông tin điện tử Bộ Tư pháp (Moj). Khác với tiện ích: mạng và các thao tác trên trang CMS được thực hiện bằng mã gốc của Android, nên không cần máy trung gian.

- Build: workflow `.github/workflows/android-apk.yml` (GitHub Actions) tạo file APK debug và đưa lên mục Artifacts `dan-bai-cms-apk`.
- Thư mục `app/src/main/assets/app` được sao chép tự động từ `tools/dan-bai-cms` khi build (không commit).
- Cài trên điện thoại: tải APK, mở file, cho phép «Cài đặt ứng dụng không xác định» khi điện thoại hỏi. Nếu máy đang có bản cũ (chỉ PLQG) thì gỡ bản cũ trước, vì mỗi lần build APK debug dùng một khóa ký khác nhau.

## Bốn tab

- **Kéo bài**: dán link, lấy bài, sửa, rồi bấm «Điền vào CMS PLQG» hoặc «Điền vào CMS Moj».
- **Kho ảnh**: ảnh của bài tự tải vào kho khi lấy bài; khi điền CMS, ứng dụng lấy ảnh từ kho nên không phải tải lại. Kho nằm trong bộ nhớ riêng của ứng dụng; có thể thêm ảnh từ điện thoại và xóa ảnh trong kho.
- **PLQG** và **Moj**: màn hình của từng CMS. Đăng nhập ở đây một lần, ứng dụng giữ phiên đăng nhập.

## Lưu ý khi dùng

- Nếu CMS đang ở trang đăng nhập, ứng dụng báo và không điền. Đăng nhập trong tab CMS đó rồi bấm nút điền lại.
- Thông báo điền hiện trên thanh phía trên màn hình CMS.
- CMS Moj: khi điền, ứng dụng mở trang «Thêm mới tin bài» trong tab Moj (trang đang mở ở tab đó bị thay thế). Cửa sổ kho ảnh của CMS hiện chồng lên tab Moj và tự đóng khi ảnh được chọn; nút Quay lại của điện thoại đóng cửa sổ đó.
- Phần «Chỉ định ô» của PLQG chỉ dùng được trên máy tính.
