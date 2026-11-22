# Nhạc Lossless (Android)

Trình phát nhạc cục bộ, nhẹ pin, phát FLAC/WAV/ALAC từ bộ nhớ máy. Android 8.0+.

- Phát nền bằng Media3 `MediaSessionService` (có thông báo điều khiển, màn hình khóa, tai nghe).
- Bật **audio offload** (giải mã trên DSP khi máy hỗ trợ), không mạng, không quét nền, không quảng cáo.
- Màn hình hiện định dạng, bit sâu (nếu biết), tần số lấy mẫu của bài đang phát.
- Ô «Chỉ lossless» lọc theo đuôi `.flac`, `.wav`, `.alac`; bỏ chọn để xem mọi file nhạc (MP3, AAC, ... ExoPlayer phát được).

## Build

GitHub Actions `.github/workflows/android-music-apk.yml` (khi push vào `android-music/**`), artifact `nhac-lossless-apk`.
Đây là APK debug; khóa ký mỗi lần build khác nhau nên phải gỡ bản cũ trước khi cài bản mới.
Build tại máy: `cd android-music && ./gradlew assembleDebug` (cần Android SDK 35).
