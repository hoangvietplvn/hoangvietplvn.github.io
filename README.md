# Blog cá nhân

Website tĩnh phong cách báo chí. Bài viết là các tệp Markdown trong `posts/`; lệnh build xuất toàn bộ website vào `dist/`.

## Dùng hằng ngày

| Việc | Lệnh |
| --- | --- |
| Tạo bài mới | `npm run new -- "Tiêu đề bài viết"` |
| Xem thử trên máy (http://localhost:8080) | `npm run preview` |
| Dựng website | `npm run build` |

Lần đầu cần chạy `npm install`.

## Viết bài

Mỗi bài là một tệp `posts/NĂM-THÁNG-NGÀY-ten-bai.md`, mở đầu bằng phần khai báo:

```
---
title: Tiêu đề bài viết
date: 2026-11-12
category: Suy ngẫm
excerpt: Sapo — một hai câu tóm tắt.
cover: /images/anh-bia.jpg
cover_caption: Chú thích ảnh bìa
layout: article
draft: true
---
```

- `layout`: `article` (bài thường) hoặc `longform` (ảnh bìa tràn màn hình, chữ lớn hơn).
- `cover`: bỏ trống thì website tự vẽ một ảnh bìa trừu tượng. Ảnh đặt trong `static/images/`.
- `draft: true`: bài nháp, chưa đăng. Xoá dòng này để đăng.
- `category`: chuyên mục mới tự xuất hiện trên thanh điều hướng.

### Khối trình bày cho bài long-form

Chèn trực tiếp HTML vào bài:

- Trích dẫn nổi bật: `<aside class="pullquote">Câu trích<cite>Nguồn</cite></aside>`
- Ảnh rộng / tràn màn hình: `<figure class="wide">` hoặc `<figure class="full">` kèm `<figcaption>`
- Dải số liệu: `<div class="stats"><div><b>12</b><span>Nhãn</span></div>…</div>`
- Tiêu đề chương: `<div class="chapter"><span>Phần một</span><h2>Tên chương</h2></div>`
- Ghi chú bên lề: `<div class="note"><strong>Nhãn</strong>Nội dung</div>`
- Dấu phân cách: một dòng `---`

## Tuỳ chỉnh

- Tên blog, khẩu hiệu, tác giả, tên miền: `site.config.json`
- Trang giới thiệu: `pages/gioi-thieu.md`
- Màu sắc, phông chữ: phần `:root` đầu tệp `src/styles.css`

## Đưa lên mạng với tên miền riêng

1. Đẩy thư mục này lên một kho GitHub (nhánh `main`).
2. Trong kho: **Settings → Pages → Source: GitHub Actions**. Mỗi lần đẩy bài mới, website tự cập nhật.
3. Mua tên miền, điền vào `site.config.json` (`"domain": "tenmien.com"`, `"url": "https://tenmien.com"`).
4. Tại nhà cung cấp tên miền, tạo bản ghi DNS trỏ về GitHub Pages, rồi nhập tên miền ở **Settings → Pages → Custom domain** và bật **Enforce HTTPS**.

## Bài long-form thiết kế riêng

Bài cần giao diện riêng (ví dụ loạt bài tông đỏ, nền trống đồng) là một tệp `.html` trong `posts/` với `layout: custom` và `theme: trong-dong`. Phần CSS của chủ đề nằm cuối `src/styles.css`.

## Trang quản trị (CMS)

Mở `https://hoangvietplvn.github.io/admin/` và đăng nhập bằng mã truy cập (access token) của GitHub. Tại đây có thể viết/sửa/xoá bài, tải ảnh, thêm/đổi tên/sắp xếp chuyên mục, sửa trang tĩnh và thông tin chung của blog. Mỗi lần Lưu là một lần ghi vào kho; blog tự đăng lại sau khoảng nửa phút.

- Cấu hình các ô nhập: `static/admin/config.yml`
- Chuyên mục: mỗi tệp trong `categories/` là một chuyên mục (`name`, `order`, `description`)
- Ảnh tải lên: `static/images/uploads/`
- Bài long-form thiết kế riêng (tệp `.html`) không hiện trong trang quản trị.
