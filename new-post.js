#!/usr/bin/env node
/* Tạo bài mới:  npm run new -- "Tiêu đề bài viết" */
const fs = require('fs');
const path = require('path');
const title = process.argv.slice(2).join(' ').trim();
if (!title) { console.error('Cách dùng: npm run new -- "Tiêu đề bài viết"'); process.exit(1); }
const slug = title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const date = new Date().toISOString().slice(0, 10);
const file = path.join(__dirname, 'posts', `${date}-${slug}.md`);
if (fs.existsSync(file)) { console.error('Bài đã tồn tại: ' + file); process.exit(1); }
fs.writeFileSync(file, `---
title: ${title}
date: ${date}
category: chinh-luan
excerpt: Một hai câu tóm tắt (sapo) hiện dưới tiêu đề và ngoài trang nhất.
layout: article
draft: true
---

Viết nội dung ở đây…
`);
console.log('Đã tạo ' + path.relative(process.cwd(), file) + ' (đang là bản nháp — xoá dòng "draft: true" để đăng)');
