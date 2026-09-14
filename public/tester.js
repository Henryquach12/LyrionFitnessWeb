(() => {
  "use strict";

  // A future public invitation can be supplied in the shared site configuration.
  // Until then, every invitation action leads to the working early signup form.
  let inviteUrl = "";
  try {
    const candidate = new URL(window.LYRION_CONFIG?.testFlightUrl || "");
    if (candidate.protocol === "https:" && candidate.hostname === "testflight.apple.com" &&
        !candidate.username && !candidate.password && !candidate.port &&
        /^\/join\/[A-Za-z0-9]+\/?$/.test(candidate.pathname)) {
      inviteUrl = candidate.href;
    }
  } catch { /* No public invitation has been configured. */ }

  if (inviteUrl) {
    document.querySelectorAll(".tester-invite-note").forEach((note) => {
      const inlineLink = note.querySelector(".tester-invite-link");
      if (inlineLink) {
        note.replaceChildren(document.createTextNode("Lời mời thử nghiệm đã sẵn sàng. "), inlineLink);
      } else {
        note.textContent = "Lời mời thử nghiệm đã sẵn sàng. Mở liên kết trên iPhone đã cài TestFlight để tham gia.";
      }
    });
    document.querySelectorAll(".tester-invite-link").forEach((link) => {
      link.href = inviteUrl;
      link.textContent = "Mở lời mời TestFlight";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });
  }

  const steps = [...document.querySelectorAll(".tester-step")];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!steps.length || reducedMotion.matches || !("IntersectionObserver" in window)) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      if (!isIntersecting) return;
      target.classList.add("is-visible");
      observer.unobserve(target);
    });
  }, { threshold: 0.08 });

  steps.forEach((step) => {
    step.classList.add("tester-will-reveal");
    observer.observe(step);
  });

  // Keyboard and deep-link navigation should expose the destination immediately.
  const revealInstantly = (step) => {
    if (!step) return;
    step.classList.add("tester-reveal-instant", "is-visible");
    observer.unobserve(step);
  };
  document.addEventListener("focusin", (event) => {
    revealInstantly(event.target.closest(".tester-step"));
  });
  const revealHash = () => {
    const step = document.getElementById(location.hash.slice(1));
    if (step?.classList.contains("tester-step")) revealInstantly(step);
  };
  window.addEventListener("hashchange", revealHash);
  revealHash();
  reducedMotion.addEventListener("change", (event) => {
    if (!event.matches) return;
    steps.forEach(revealInstantly);
    observer.disconnect();
  });
  window.addEventListener("pagehide", () => {
    steps.forEach(revealInstantly);
    observer.disconnect();
  }, { once: true });
})();
