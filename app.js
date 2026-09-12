(() => {
  "use strict";

  const screenDescriptions = {
    welcome: "Màn hình chào mừng của ứng dụng LyrionFitness",
    workout: "Màn hình kế hoạch tập luyện trong ứng dụng LyrionFitness",
    nutrition: "Màn hình theo dõi dinh dưỡng trong ứng dụng LyrionFitness",
    progress: "Màn hình theo dõi tiến trình trong ứng dụng LyrionFitness",
  };

  function getAppStoreUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";

    try {
      const url = new URL(value.trim());
      return url.protocol === "https:" &&
        url.hostname === "apps.apple.com" &&
        !url.port && !url.username && !url.password
        ? url.href
        : "";
    } catch {
      return "";
    }
  }

  function getScreenshotUrl(value) {
    if (typeof value !== "string") return "";
    const source = value.trim();
    if (!source || /[\\\u0000-\u001f]/.test(source)) return "";

    try {
      if (/^https:\/\//i.test(source)) {
        const url = new URL(source);
        return url.protocol === "https:" && !url.username && !url.password
          ? url.href
          : "";
      }

      // Reject protocol-relative URLs, other protocols, and empty image paths.
      if (/^(?:\/\/|[a-z][a-z\d+.-]*:|[?#])/i.test(source)) return "";
      return source;
    } catch {
      return "";
    }
  }

  function setupStoreLinks(config) {
    const storeUrl = getAppStoreUrl(config.appStoreUrl);

    document.querySelectorAll("[data-store-link]").forEach((link) => {
      link.setAttribute("href", storeUrl || "#download");
      const label = link.querySelector("[data-store-label]");
      if (label) {
        label.textContent = storeUrl ? "Tải trên App Store" : "Sắp có trên App Store";
      }
    });

    if (!storeUrl) return;
    const heading = document.getElementById("release-heading");
    const status = document.getElementById("release-status");
    if (heading) heading.textContent = "Bắt đầu cùng LyrionFitness.";
    if (status) {
      status.textContent = "LyrionFitness đã có mặt trên App Store. Bắt đầu hành trình của bạn với 3 tháng sử dụng miễn phí.";
    }
  }

  function setupScreenshots(config) {
    const screenshots = config.screenshots || {};

    document.querySelectorAll("[data-screen]").forEach((screen) => {
      const name = screen.dataset.screen;
      const source = getScreenshotUrl(screenshots[name]);
      const image = screen.querySelector("img.screen-image");
      const preview = screen.querySelector(".screen-preview");
      if (!source || !image || !preview) return;

      const showPreview = () => {
        image.hidden = true;
        preview.hidden = false;
        screen.classList.remove("has-real-screen");
      };
      const showImage = () => {
        if (!image.naturalWidth) {
          showPreview();
          return;
        }
        image.hidden = false;
        preview.hidden = true;
        screen.classList.add("has-real-screen");
      };

      image.addEventListener("load", showImage);
      image.addEventListener("error", showPreview);
      image.alt = screenDescriptions[name] || "Màn hình ứng dụng LyrionFitness";
      image.decoding = "async";
      // A hidden lazy image may never load; reveal only once decoding succeeds.
      image.loading = "eager";
      image.src = source;
      if (image.complete && image.naturalWidth) showImage();
    });
  }

  function setupMenu() {
    const toggle = document.querySelector(".menu-toggle");
    const navigation = document.getElementById("nav-links");
    if (!toggle || !navigation) return;

    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Đóng trình đơn" : "Mở trình đơn");
      toggle.classList.toggle("is-open", open);
      navigation.classList.toggle("is-open", open);
      document.body.classList.toggle("menu-open", open);
    };
    const isOpen = () => toggle.getAttribute("aria-expanded") === "true";

    setOpen(false);
    toggle.addEventListener("click", () => setOpen(!isOpen()));
    navigation.addEventListener("click", (event) => {
      if (event.target.closest("a")) setOpen(false);
    });
    document.addEventListener("click", (event) => {
      if (isOpen() && !navigation.contains(event.target) && !toggle.contains(event.target)) {
        setOpen(false);
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen()) {
        setOpen(false);
        toggle.focus();
      }
    });
    window.addEventListener("resize", () => setOpen(false), { passive: true });
  }

  function setupReveals(reducedMotion) {
    if (reducedMotion.matches || !("IntersectionObserver" in window)) return;
    const elements = document.querySelectorAll("[data-reveal]");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08 });

    elements.forEach((element) => {
      element.classList.add("reveal-ready");
      observer.observe(element);
    });

    reducedMotion.addEventListener("change", (event) => {
      if (!event.matches) return;
      observer.disconnect();
      elements.forEach((element) => element.classList.add("is-visible"));
    });
  }

  function setupPointerGlow(reducedMotion) {
    const glow = document.getElementById("pointer-glow");
    if (!glow) return;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    let frame = 0;
    let x = 0;
    let y = 0;
    let enabled = false;

    const hide = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      glow.classList.remove("is-active");
    };
    const syncPreference = () => {
      enabled = finePointer.matches && !reducedMotion.matches;
      glow.hidden = !enabled;
      if (!enabled) hide();
    };

    window.addEventListener("pointermove", (event) => {
      if (!enabled || event.pointerType === "touch") return;
      x = event.clientX;
      y = event.clientY;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        glow.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        glow.classList.add("is-active");
        frame = 0;
      });
    }, { passive: true });
    document.documentElement.addEventListener("pointerleave", hide);
    window.addEventListener("blur", hide);
    finePointer.addEventListener("change", syncPreference);
    reducedMotion.addEventListener("change", syncPreference);
    syncPreference();
  }

  function init() {
    document.documentElement.classList.add("js");
    const config = window.LYRION_CONFIG || {};
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    setupStoreLinks(config);
    setupScreenshots(config);
    setupMenu();
    setupReveals(reducedMotion);
    setupPointerGlow(reducedMotion);

    const year = document.getElementById("year");
    if (year) year.textContent = String(new Date().getFullYear());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
