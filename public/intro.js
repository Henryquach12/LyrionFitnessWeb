/* Runs just after the intro markup, before the main page can paint. */
(() => {
  "use strict";
  const root = document.documentElement;
  let entrance;
  let entranceStarted = false;
  let entranceFallback;

  // This script runs before the hero markup, so even the first paint is small.
  // Without JavaScript the wrapper has no pending state and stays fully visible.
  root.classList.add("hero-entrance-pending");

  function settleEntrance() {
    entranceStarted = true;
    clearTimeout(entranceFallback);
    root.classList.remove("hero-entrance-pending", "hero-entrance-running");
    entrance?.removeEventListener("animationend", onEntranceEnd);
    entrance?.removeEventListener("animationcancel", onEntranceEnd);
    document.removeEventListener("DOMContentLoaded", revealHero);
    removeEventListener("pagehide", settleEntrance);
  }

  function onEntranceEnd(event) {
    if (event.target === entrance && ["hero-entrance-scale", "hero-entrance-fade"].includes(event.animationName)) {
      settleEntrance();
    }
  }

  function revealHero() {
    if (entranceStarted) return;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", revealHero, { once: true });
      return;
    }
    entrance = document.querySelector(".hero-entrance");
    if (!entrance) {
      settleEntrance();
      return;
    }
    entranceStarted = true;
    entrance.addEventListener("animationend", onEntranceEnd);
    entrance.addEventListener("animationcancel", onEntranceEnd);
    addEventListener("pagehide", settleEntrance, { once: true });
    root.classList.replace("hero-entrance-pending", "hero-entrance-running");
    // Also release the temporary state if a user stylesheet disables animations.
    entranceFallback = setTimeout(settleEntrance, 2800);
  }

  const intro = document.querySelector(".page-intro");
  const logo = intro?.querySelector("img");
  if (!intro || !logo || typeof intro.showModal !== "function") {
    intro?.remove();
    revealHero();
    return;
  }

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
    revealHero();
    root.classList.remove("intro-active");
    if (intro.open) intro.close();
    intro.remove();
    removeEventListener("pagehide", onPageHide);
    removeEventListener("resize", fitViewport);
  }

  function onPageHide() {
    finish();
    settleEntrance();
  }

  // A native modal also keeps keyboard focus and assistive technology out of
  // the page underneath until the reveal is complete, without a layout wrapper.
  intro.addEventListener("cancel", event => event.preventDefault());
  intro.addEventListener("animationstart", event => {
    if (event.target === intro && event.animationName === "page-intro-exit") revealHero();
  });
  intro.addEventListener("animationend", event => {
    if (event.target === intro && event.animationName === "page-intro-exit") finish();
  });
  intro.addEventListener("animationcancel", event => {
    if (event.target === intro && event.animationName === "page-intro-exit") finish();
  });
  addEventListener("pagehide", onPageHide, { once: true });
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
