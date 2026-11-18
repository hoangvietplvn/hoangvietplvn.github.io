# Dẫn bài vào CMS (PLQG + Bộ Tư pháp)

Tiện ích cho Chrome/Edge/Cốc Cốc: dán link bài báo hoặc link Google Docs, tiện ích bóc tách bài một lần rồi điền vào một trong hai CMS đang đăng nhập sẵn trên trình duyệt:

- **CMS PLQG** — Cổng Pháp luật quốc gia (cms.phapluat.gov.vn), nút **Điền vào CMS PLQG**;
- **CMS Moj** — Cổng thông tin điện tử Bộ Tư pháp (moj.gov.vn/cms), nút **Điền vào CMS Moj**.

Một bài có thể điền lần lượt vào cả hai CMS mà không phải lấy lại.

Bản cho điện thoại Android dùng chung mã này: xem `android/README.md`.

## Cài đặt

1. Giải nén `dan-bai-cms.zip`.
2. Mở `chrome://extensions`, bật **Chế độ dành cho nhà phát triển**.
3. Bấm **Tải tiện ích đã giải nén** và chọn thư mục `dan-bai-cms`.
4. Gỡ (hoặc tắt) hai tiện ích riêng lẻ cũ để khỏi nhầm biểu tượng.

Nếu giải nén đè lên đúng thư mục `dan-bai-cms` của tiện ích PLQG cũ rồi bấm nút tải lại, các thiết lập và ô đã «Chỉ định» của PLQG được giữ nguyên. Thiết lập của tiện ích Moj cũ (tên chuyên mục, tự lưu) cần đặt lại một lần.

**Nên làm một lần cho CMS Moj:** cho phép cửa sổ bật lên từ `moj.gov.vn` (biểu tượng cạnh địa chỉ trang CMS → Cài đặt trang web → Cửa sổ bật lên và liên kết chuyển hướng → Cho phép). Nếu không, mỗi bài bạn phải tự bấm nút «Chọn ảnh mới» một lần.

## Dùng hằng ngày

1. Đăng nhập CMS cần đăng.
2. Bấm biểu tượng tiện ích, dán link, bấm **Lấy bài**.
3. Đọc lại và sửa nếu cần. Phần chung: tiêu đề, sapo/tóm tắt, ảnh đại diện, nội dung. Mỗi CMS có một khung riêng:
   - **Riêng cho CMS PLQG**: Tác giả (điền vào ô Tác giả, mặc định «Theo [tên nguồn]»), Danh mục.
   - **Riêng cho CMS Moj**: Tác giả (ghi thành dòng cuối bài), Chuyên mục chính, Chú thích ảnh đại diện.
4. Bấm **Điền vào CMS PLQG** hoặc **Điền vào CMS Moj**.
5. Kiểm tra trên CMS rồi lưu.

Dòng thông báo cạnh nút ghi rõ CMS nào, ô nào đã điền, ô nào cần nhập tay.

### Điền vào CMS PLQG

Tiện ích tự bấm nút **+** nếu form «Tạo bài viết» chưa mở, rồi điền Tiêu đề, Tóm tắt, Nội dung, Tác giả; đặt Ngày đăng là hiện tại; đẩy ảnh đại diện lên ô Hình ảnh đại diện; chọn Danh mục trong hộp «Chọn Bản Ghi». Với Google Docs, ảnh trong bài được tải lên CMS và chèn đúng vị trí dấu `[[ẢNH n]]`. Ảnh mở đầu bài vẫn nằm trong nội dung.

### Điền vào CMS Moj

Tiện ích mở trang «Thêm mới tin bài» (hoặc dùng tab đang mở sẵn trang đó; trang bị treo thì tự tải lại tối đa 2 lần), rồi:

- điền Tiêu đề, Tóm tắt, Nội dung («Tít phụ» để trống);
- bấm «Chọn ảnh mới», trong cửa sổ kho ảnh bấm thư mục «Default», bấm nút tải lên, tải ảnh đại diện rồi chọn ảnh đó;
- điền Chú thích ảnh đại diện;
- chọn Chuyên mục chính nếu bạn đã gõ tên chuyên mục.

Ảnh mở đầu bài (cùng chú thích) được bỏ khỏi nội dung vì CMS Moj tự hiển thị ảnh đại diện ở đầu bài. Tiện ích không bao giờ bấm «Gửi kiểm duyệt» hay «Công khai ngay», và dừng lại nếu form đang soạn dở một bài khác.

## Ảnh và chú thích ảnh trong bài

Mọi ảnh trong nội dung được đặt vào đoạn căn giữa; chú thích ảnh được căn giữa và in nghiêng. Tiện ích nhận ra chú thích theo cách báo gốc đánh dấu (khối figure/figcaption, bảng bọc ảnh, khối có tên lớp «caption»/«chú thích», hoặc đoạn ngắn ngay sau ảnh đã được báo gốc căn giữa hay in nghiêng). Nếu một báo không đánh dấu chú thích theo các cách đó, đoạn chú thích vẫn là đoạn thường; hãy sửa trong khung Nội dung.

## Liên kết trong bài

Mọi liên kết (hyperlink) gắn vào chữ trong nội dung đều bị gỡ khi lấy bài và khi điền vào cả hai CMS; phần chữ được giữ nguyên. Riêng dòng «Theo …» ở cuối bài vẫn kèm link gốc nếu bạn bật tùy chọn đó.

## Ảnh đại diện

Ảnh mở đầu bài (đứng trước phần lớn nội dung) là ảnh đại diện cho cả hai CMS. Bài không có ảnh mở đầu thì lấy ảnh chia sẻ (og:image) của trang gốc. Với Google Docs: ảnh ngay sau sapo, hoặc link ở dòng «Ảnh đại diện:».

## Dán link Google Docs

- Tài liệu phải mở quyền **Bất kỳ ai có đường liên kết** (Người xem), hoặc trình duyệt đang đăng nhập tài khoản Google có quyền xem.
- Nên viết các dòng đầu theo mẫu (không bắt buộc): `Tiêu đề:`, `Sapo:` (hoặc `Tóm tắt:`), `Tác giả:`, `Danh mục:`, `Ảnh đại diện:`, `Nội dung:`.
- Không có nhãn: tiêu đề là heading hoặc dòng đầu, đoạn ngắn kế tiếp là sapo, phần còn lại là nội dung.
- Chú thích ảnh: đoạn chữ ngắn ngay sau một ảnh.

## Thiết lập CMS

Mỗi CMS có một nhóm thiết lập riêng: địa chỉ trang, tự đẩy ảnh đại diện, tự bấm lưu (mặc định tắt), và nút **Sao chép thông tin chẩn đoán**. Riêng PLQG có thêm tự đặt Ngày đăng và bảng **Chỉ định** ô.

Khi tiện ích điền sai: mở form soạn bài trên CMS tương ứng (với Moj, mở cả cửa sổ chọn ảnh nếu lỗi ở bước ảnh), bấm nút chẩn đoán của CMS đó rồi gửi kết quả cho người hỗ trợ. Thông tin chỉ gồm cấu trúc trang, không kèm nội dung bài.

## Giới hạn

- Ảnh trong thân bài báo vẫn trỏ về máy chủ của báo gốc (cả hai CMS).
- CMS Moj: ảnh trong thân tài liệu Google Docs (trừ ảnh đại diện) được thay bằng dấu `[[ẢNH n]]` để chèn tay.
- CMS PLQG: chú thích ảnh đại diện, tag, các tab Multimedia và SEO cần làm tay.
- Chỉ dẫn lại bài khi đơn vị có quyền sử dụng nội dung đó.

Thư viện bóc tách nội dung: [Mozilla Readability](https://github.com/mozilla/readability) (giấy phép Apache 2.0).
