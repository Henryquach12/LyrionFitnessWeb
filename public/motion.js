/* Scroll-linked hero phone motion. */
(() => {
  "use strict";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const hero = document.querySelector(".hero");
  const phones = document.querySelector(".hero-phones");
  let scrollFrame = 0;
  let heroEnd = 400;
  function renderHero() {
    scrollFrame = 0;
    const progress = Math.min(1, Math.max(0, scrollY / heroEnd));
    phones.style.transform = reduced.matches ? "none" : `scale(${1 + .075 * (1 - progress)})`;
  }
  function queueHero() {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(renderHero);
  }
  function measureHero() {
    heroEnd = Math.max(180, hero.offsetHeight * .55);
    queueHero();
  }
  addEventListener("scroll", queueHero, { passive: true });
  addEventListener("resize", measureHero, { passive: true });
  if ("ResizeObserver" in window) new ResizeObserver(measureHero).observe(hero);
  measureHero();

  reduced.addEventListener("change", queueHero);
})();
