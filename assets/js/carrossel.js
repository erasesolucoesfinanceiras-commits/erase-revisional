/* Carrossel de destaques da capa. Sem biblioteca. Funciona sem JS (faixa rolável); com JS ganha setas e pontos.
 * Autoplay DESLIGADO de propósito (acessibilidade). Respeita prefers-reduced-motion (rolagem instantânea). */
(function () {
  const root = document.querySelector('.carousel');
  if (!root) return;
  const track = root.querySelector('.carousel-track'), slides = Array.from(track.children);
  const prev = root.querySelector('.car-prev'), next = root.querySelector('.car-next'), nav = root.querySelector('.car-nav');
  const dots = Array.from(root.querySelectorAll('.car-dot')), cur = root.querySelector('.car-cur');
  const n = slides.length;
  if (n < 2) return;
  const reduz = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let idx = 0;
  [prev, next, nav].forEach((el) => el && el.removeAttribute('hidden'));
  root.classList.add('is-ready');

  function marcar(i) {
    idx = i;
    slides.forEach((s, k) => { if (k === i) s.removeAttribute('inert'); else s.setAttribute('inert', ''); }); // só o slide visível entra na ordem de tabulação e nos leitores de tela
    dots.forEach((d, k) => d.setAttribute('aria-current', k === i ? 'true' : 'false'));
    if (cur) cur.textContent = String(i + 1);
    if (prev) prev.disabled = i === 0;
    if (next) next.disabled = i === n - 1;
  }
  function ir(i, foco) {
    i = Math.max(0, Math.min(n - 1, i));
    track.scrollTo({ left: i * track.clientWidth, behavior: reduz() ? 'auto' : 'smooth' });
    marcar(i);
    if (foco) foco.focus();
  }
  let quadro = 0;
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(quadro);
    quadro = requestAnimationFrame(() => { const i = Math.round(track.scrollLeft / track.clientWidth); if (i !== idx) marcar(i); });
  }, { passive: true });
  if (prev) prev.addEventListener('click', () => ir(idx - 1));
  if (next) next.addEventListener('click', () => ir(idx + 1));
  dots.forEach((d, k) => d.addEventListener('click', () => ir(k)));
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); ir(idx - 1, e.target.closest('.car-dot') ? dots[Math.max(0, idx - 1)] : null); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); ir(idx + 1, e.target.closest('.car-dot') ? dots[Math.min(n - 1, idx + 1)] : null); }
  });
  window.addEventListener('resize', () => { track.scrollTo({ left: idx * track.clientWidth, behavior: 'auto' }); });
  marcar(0);
})();
