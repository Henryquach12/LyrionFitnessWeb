(() => {
  "use strict";
  const form = document.querySelector("#waitlist-form");
  const fields = form.querySelector("fieldset");
  const button = form.querySelector("button[type=submit]");
  const status = document.querySelector("#waitlist-status");
  let busy = false;
  function message(text, state) {
    status.textContent = text;
    status.dataset.state = state;
  }
  form.addEventListener("input", event => {
    event.target.removeAttribute("aria-invalid");
    if (!busy) message("", "");
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    const values = new FormData(form);
    const name = String(values.get("name") || "").trim();
    if (name.length < 2) {
      form.elements.name.setAttribute("aria-invalid", "true");
      form.elements.name.focus();
      message("Bạn nhập tên từ 2 ký tự nhé.", "error");
      return;
    }
    if (location.protocol === "file:") {
      message("Đăng ký hiện chưa mở. Bạn vui lòng quay lại sau nhé.", "error");
      return;
    }
    busy = true;
    fields.disabled = true;
    form.setAttribute("aria-busy", "true");
    button.textContent = "Đang gửi…";
    message("", "");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email: String(values.get("email") || "").trim(), company: String(values.get("company") || "") }),
        signal: AbortSignal.timeout(15000)
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) {
        if (response.status === 503) throw new Error("Đăng ký hiện chưa mở. Bạn vui lòng quay lại sau nhé.");
        if (response.status === 429) throw new Error("Bạn đã thử vài lần. Chờ một chút rồi gửi lại nhé.");
        if (response.status === 400) throw new Error("Bạn kiểm tra lại tên và địa chỉ email nhé.");
        throw new Error("Chưa gửi được đăng ký. Bạn vui lòng thử lại.");
      }
      form.reset();
      message("Bạn đã có tên trong danh sách chờ. Lyrion sẽ gửi email khi ra mắt!", "success");
    } catch (error) {
      message(error.name === "TimeoutError" || error.name === "TypeError" ? "Kết nối bị gián đoạn. Thông tin vẫn ở đây để bạn thử lại." : error.message, "error");
    } finally {
      busy = false;
      fields.disabled = false;
      form.removeAttribute("aria-busy");
      button.textContent = "Tham gia danh sách chờ";
    }
  });
})();
