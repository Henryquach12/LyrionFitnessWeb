(() => {
  "use strict";
  const config = window.LYRION_CONFIG || {};
  const group = document.querySelector(".review-group");
  const cards = [...group.querySelectorAll(".review-card")].sort((a, b) => Number(a.dataset.review) - Number(b.dataset.review));
  const next = document.querySelector(".reviews-next");
  const counter = document.querySelector(".review-counter");
  const status = document.querySelector("[data-review-status]");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let current = 0;
  let animation;

  cards.forEach((card, index) => {
    const entry = config.reviews?.[index] || {};
    if (entry.text) card.querySelector("blockquote > p").textContent = entry.text;
    if (entry.name) card.querySelector("footer strong").textContent = entry.name;
    if (entry.detail) card.querySelector("footer > span:last-child > span").textContent = entry.detail;
    const rating = card.querySelector(".review-rating");
    const configuredRating = Number(entry.rating);
    const score = [4, 5].includes(configuredRating) ? configuredRating : (rating.dataset.rating === "4" ? 4 : 5);
    rating.dataset.rating = String(score);
    rating.setAttribute("aria-label", `${score} trên 5 sao`);
    const stars = rating.querySelector("span");
    stars.textContent = "★".repeat(score);
    if (score === 4) {
      const emptyStar = document.createElement("span");
      emptyStar.className = "review-star-empty";
      emptyStar.textContent = "☆";
      stars.append(emptyStar);
    }
    const avatar = card.querySelector(".avatar");
    const name = card.querySelector("footer strong").textContent;
    const initials = name.trim().split(/\s+/u).slice(-2).map(word => word[0]).join("");
    avatar.textContent = initials;
    if (typeof entry.avatar === "string" && entry.avatar.trim()) {
      let url;
      try { url = new URL(entry.avatar, document.baseURI); } catch { /* Keep initials for malformed URLs. */ }
      if (url && ["https:", "http:", "file:"].includes(url.protocol)) {
        const img = document.createElement("img");
        img.alt = "";
        img.width = img.height = 38;
        img.src = url.href;
        img.addEventListener("error", () => { avatar.textContent = initials; }, { once: true });
        avatar.replaceChildren(img);
      }
    }
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", `Nhận xét ${index + 1} trên ${cards.length}`);
  });

  function render(animate = false) {
    animation?.cancel();
    const visible = [];
    cards.forEach((_, offset) => {
      const index = (current + offset) % cards.length;
      const card = cards[index];
      card.hidden = offset >= 3;
      group.append(card);
      if (!card.hidden) visible.push(index + 1);
    });
    counter.textContent = `${String(current + 1).padStart(2, "0")} / ${String(cards.length).padStart(2, "0")}`;
    status.textContent = `Đang hiển thị nhận xét ${visible.join(", ")} trên ${cards.length}.`;
    if (animate && !reduced.matches) {
      animation = group.animate([
        { opacity: .55, transform: "translateX(12px)" },
        { opacity: 1, transform: "translateX(0)" }
      ], { duration: 200, easing: getComputedStyle(document.documentElement).getPropertyValue("--ease-out").trim() });
    }
  }
  next.hidden = false;
  next.addEventListener("click", event => {
    current = (current + 1) % cards.length;
    render(event.detail > 0);
  });
  reduced.addEventListener("change", () => animation?.cancel());
  render();
})();
