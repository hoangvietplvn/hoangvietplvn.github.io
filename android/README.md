# Dẫn bài CMS — ứng dụng Android (APK)

Ứng dụng dùng chung giao diện và logic với tiện ích Chrome (`tools/dan-bai-cms`). Khác biệt: mạng và các thao tác trên trang CMS được thực hiện bằng mã gốc của Android, nên không cần máy trung gian.

- Build: workflow `.github/workflows/android-apk.yml` (GitHub Actions) tạo file APK debug và đưa lên mục Artifacts `dan-bai-cms-apk`.
- Thư mục `app/src/main/assets/app` được sao chép tự động từ `tools/dan-bai-cms` khi build (không commit).
- Cài trên điện thoại: tải APK, mở file, cho phép «Cài đặt ứng dụng không xác định» khi Samsung hỏi.
