(() => {
  "use strict";
  const config = window.LYRION_CONFIG || {};
  const previews = window.LYRION_PREVIEWS || {};
  const names = {
    welcome: "Kế hoạch dành riêng cho bạn",
    workout: "Buổi tập có định hướng",
    nutrition: "Theo dõi calo và macro",
    progress: "Tiến độ và phục hồi"
  };
  const keys = Object.keys(names);

  function renderPreview(container, key) {
    container.replaceChildren();
    const src = config.screenshots?.[key];
    if (typeof src === "string" && src.trim()) {
      const img = document.createElement("img");
      img.className = "real-screenshot";
      img.alt = names[key];
      img.src = src;
      img.decoding = "async";
      img.addEventListener("error", () => {
        container.innerHTML = previews[key] || "";
      }, { once: true });
      container.append(img);
    } else {
      container.innerHTML = previews[key] || "";
    }
  }

  document.querySelectorAll("[data-preview]").forEach(el => renderPreview(el, el.dataset.preview));

  let storeUrl = null;
  try {
    const url = new URL(config.appStoreUrl);
    if (url.protocol === "https:" && url.hostname === "apps.apple.com") storeUrl = url.href;
  } catch { /* Keep the explicit coming-soon state until a valid URL exists. */ }

  if (storeUrl) {
    document.querySelectorAll("[data-store-link]").forEach(link => {
      link.href = storeUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.removeAttribute("aria-disabled");
    });
    document.querySelectorAll("[data-store-label]").forEach(el => { el.textContent = "Tải trên App Store"; });
    document.querySelectorAll("[data-release-note]").forEach(el => { el.textContent = "LyrionFitness đã có mặt trên App Store."; });
    document.querySelectorAll("[data-release-answer]").forEach(el => { el.textContent = "LyrionFitness đã có trên App Store. Chọn nút tải ở cuối trang để mở trang ứng dụng."; });
    const heroLink = document.querySelector(".quiet-link");
    heroLink.textContent = "Tải trên App Store";
    heroLink.href = storeUrl;
    heroLink.target = "_blank";
    heroLink.rel = "noopener noreferrer";
  }

  if (typeof config.launchOffer === "string" && config.launchOffer.trim()) {
    const offer = document.querySelector("[data-launch-offer]");
    offer.textContent = config.launchOffer.trim();
    offer.hidden = false;
  }
  document.querySelector("[data-year]").textContent = new Date().getFullYear();

  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".site-nav");
  function closeMenu() {
    toggle.setAttribute("aria-expanded", "false");
    nav.classList.remove("is-open");
  }
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
  });
  nav.querySelectorAll("a").forEach(link => link.addEventListener("click", closeMenu));
  document.addEventListener("click", event => {
    if (!event.target.closest(".site-header")) closeMenu();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      closeMenu();
      toggle.focus();
    }
  });
  matchMedia("(min-width: 768px)").addEventListener("change", closeMenu);

  const tabs = [...document.querySelectorAll("[data-tab]")];
  function activateTab(tab, focus = false) {
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute("aria-controls")).hidden = !selected;
    });
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activateTab(tab));
    tab.addEventListener("keydown", event => {
      let next;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next !== undefined) {
        event.preventDefault();
        activateTab(tabs[next], true);
      }
    });
  });

  const dialog = document.querySelector(".preview-dialog");
  let currentPreview = 0;
  let previousFocus;
  function updateDialog() {
    const key = keys[currentPreview];
    document.getElementById("preview-dialog-title").textContent = names[key];
    document.querySelector("[data-preview-count]").textContent = (currentPreview + 1) + " / " + keys.length;
    renderPreview(document.getElementById("dialog-screen"), key);
  }
  function movePreview(direction) {
    currentPreview = (currentPreview + direction + keys.length) % keys.length;
    updateDialog();
  }
  document.querySelectorAll("[data-open-preview]").forEach(button => {
    button.addEventListener("click", () => {
      currentPreview = keys.indexOf(button.dataset.openPreview);
      previousFocus = button;
      updateDialog();
      dialog.showModal();
      document.body.classList.add("modal-open");
      dialog.querySelector(".dialog-close").focus();
    });
  });
  document.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
  document.querySelector("[data-preview-prev]").addEventListener("click", () => movePreview(-1));
  document.querySelector("[data-preview-next]").addEventListener("click", () => movePreview(1));
  dialog.addEventListener("click", event => {
    if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    }
  });
  dialog.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); dialog.close(); }
    if (event.key === "ArrowLeft") { event.preventDefault(); movePreview(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); movePreview(1); }
  });
  dialog.addEventListener("close", () => {
    document.body.classList.remove("modal-open");
    previousFocus?.focus({ preventScroll: true });
  });

  function initReveals() {
    // A repeated initialization keeps already-read content visible and removes old listeners.
    window.LYRION_REVEALS?.destroy();
    const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
    const groups = [
      ".hero-copy > *",
      ".section-heading .eyebrow, .section-heading h2, .section-heading > p",
      ".preview-grid > .preview-card",
      ".intelligence-copy > *",
      ".intelligence > .algorithm-stage",
      ".waitlist-copy > *",
      ".waitlist > .waitlist-board",
      ".reviews-heading .eyebrow, .reviews-heading h2, .reviews-controls",
      ".review-group > .review-card",
      ".faq > div:first-child > *",
      ".faq-items > details",
      ".download > .download-icon, .download > .eyebrow, .download > h2, .download > p"
    ].map(selector => [...document.querySelectorAll(selector)]);
    const candidates = new Set(groups.flat());
    // Reveal semantic units only: never stack an entrance on its revealed parent.
    const targets = [...candidates].filter(element => {
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (candidates.has(parent)) return false;
      }
      return true;
    });
    const targetSet = new Set(targets);
    let observer;

    function reveal(element, instant = false) {
      if (instant) element.classList.add("reveal-instant");
      element.classList.add("is-visible");
      observer?.unobserve(element);
    }

    function revealSection(node) {
      if (!(node instanceof Element)) return;
      const section = node.closest("main > section");
      if (!section) return;
      targets.forEach(element => {
        if (section.contains(element)) reveal(element, true);
      });
    }

    function onFocus(event) {
      // Keyboard users should never wait for decorative motion before reading or acting.
      revealSection(event.target);
    }

    function onClick(event) {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(".reviews-next")) {
        // Settle entrances before the carousel moves, including the initially hidden card.
        revealSection(event.target);
      }
      if (event.detail !== 0) return;
      revealSection(event.target);
      const anchor = event.target.closest('a[href^="#"]');
      if (anchor) {
        let id;
        try { id = decodeURIComponent(anchor.hash.slice(1)); } catch { return; }
        revealSection(document.getElementById(id));
      }
    }

    function onMotionChange() {
      if (!motionQuery.matches) return;
      observer?.disconnect();
      targets.forEach(element => reveal(element, true));
    }

    function destroy() {
      observer?.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("click", onClick, true);
    }

    groups.forEach(group => {
      group.filter(element => targetSet.has(element)).forEach((element, index) => {
        element.style.setProperty("--reveal-delay", `${Math.min(80 + index * 60, 260)}ms`);
      });
    });

    if ("IntersectionObserver" in window && !motionQuery.matches) {
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) reveal(entry.target);
        });
      }, { rootMargin: "0px 0px -80px 0px", threshold: 0.12 });
      targets.forEach(element => {
        element.classList.add("will-reveal");
        // Hidden/configurable content is ready immediately whenever another feature shows it.
        if (element.closest("[hidden]") || element.classList.contains("is-visible")) {
          reveal(element, true);
        } else {
          observer.observe(element);
        }
      });
    } else {
      targets.forEach(element => reveal(element, true));
    }

    document.addEventListener("focusin", onFocus);
    document.addEventListener("click", onClick, true);
    motionQuery.addEventListener("change", onMotionChange);
    revealSection(document.activeElement);
    window.LYRION_REVEALS = { init: initReveals, destroy };
  }
  initReveals();
})();
