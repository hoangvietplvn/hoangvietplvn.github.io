// Thanh tiến độ đọc
const bar = document.querySelector('.progress');
if (bar && document.body.classList.contains('post')) {
  const update = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
  };
  addEventListener('scroll', update, { passive: true });
  update();
}

// Lọc bài trong trang Lưu trữ
const input = document.querySelector('[data-filter]');
if (input) {
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();
  input.addEventListener('input', () => {
    const q = norm(input.value.trim());
    let any = false;
    document.querySelectorAll('[data-year]').forEach((year) => {
      let shown = 0;
      year.querySelectorAll('[data-item]').forEach((li) => {
        const ok = norm(li.textContent).includes(q);
        li.hidden = !ok;
        if (ok) shown++;
      });
      year.hidden = shown === 0;
      any = any || shown > 0;
    });
    document.querySelector('.noresult').hidden = any;
  });
}
