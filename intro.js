/* Runs just after the intro markup, before the main page can paint. */
(() => {
  "use strict";
  const intro = document.querySelector(".page-intro");
  const logo = intro?.querySelector("img");
  if (!intro || !logo || typeof intro.showModal !== "function") {
    intro?.remove();
    return;
  }

  const root = document.documentElement;
  let finished = false;
  let fallback;

  function fitViewport() {
    // Stable scrollbar gutters also reduce CSS viewport units in some browsers.
    // Cover the entire window while preserving the main page's reserved gutter.
    intro.style.width = `${innerWidth}px`;
  }

  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(fallback);
    root.classList.remove("intro-active");
    if (intro.open) intro.close();
    intro.remove();
    removeEventListener("pagehide", finish);
    removeEventListener("resize", fitViewport);
  }

  // A native modal also keeps keyboard focus and assistive technology out of
  // the page underneath until the reveal is complete, without a layout wrapper.
  intro.addEventListener("cancel", event => event.preventDefault());
  intro.addEventListener("animationend", event => {
    if (event.target === intro && event.animationName === "page-intro-exit") finish();
  });
  addEventListener("pagehide", finish, { once: true });
  addEventListener("resize", fitViewport, { passive: true });
  root.classList.add("intro-active");
  fitViewport();
  try {
    intro.showModal();
  } catch {
    finish();
    return;
  }

  // A missing image must not leave the page trapped behind an empty intro.
  fallback = setTimeout(finish, 6000);
  logo.decode().then(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (finished) return;
      clearTimeout(fallback);
      intro.classList.add("is-ready");
      // CSS owns the 3000ms hold and fade, so loading work cannot stutter it.
      // Release the modal even if animations are disabled by a user stylesheet.
      fallback = setTimeout(finish, 3600);
    }));
  }, finish);
})();
