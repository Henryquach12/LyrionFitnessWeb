/* Illustrative product components. Replace with real screenshots in config.js. */
(() => {
  "use strict";
  const ring = (percent, value, caption, size = 78) => `
    <div class="app-ring" style="--ring-progress:${percent}%;--ring-size:${size}px">
      <div class="app-ring-center"><strong>${value}</strong><span>${caption}</span></div>
    </div>`;
  const macro = (label, value, goal) => `
    <div class="app-macro-row"><div class="app-row"><span>${label}</span>
      <span>${value}<span class="app-muted"> / ${goal} g</span></span></div>
      <div class="app-meter"><span style="width:${Math.min(100, value / goal * 100)}%"></span></div>
    </div>`;
  const screen = (name, active, content) => `
    <div class="phone-preview" role="group" aria-label="${name}. Giao diện với dữ liệu minh họa.">
      <div class="phone-status" aria-hidden="true"><span>9:41</span><span class="phone-island"></span><span class="phone-battery"></span></div>
      <div class="app-screen"><div class="app-brand"><img src="assets/lyrion-mark.png" alt="" width="16" height="18"><span>LYRION</span></div>${content}</div>
      <div class="app-bottom-nav" aria-hidden="true">${["Tổng quan", "Lịch tập", "Dinh dưỡng"].map((label, index) => `<span${index === active ? ' class="is-active"' : ""}>${label}</span>`).join("")}</div>
      <div class="phone-home-indicator" aria-hidden="true"></div>
    </div>`;
  const exercise = (number, name, weight) => `
    <div class="app-exercise"><span class="app-exercise-number">${number}</span>
    <div style="flex:1;min-width:0"><strong>${name}</strong><span class="app-muted">3 hiệp · 8–12 lần</span></div><span>${weight} kg</span></div>`;
  const meal = (label, description, calories) => `
    <div class="app-meal"><div><strong>${label}</strong><span class="app-muted">${description}</span></div><span>${calories}<small class="app-muted"> kcal</small></span></div>`;
  const week = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day, index) => `
    <div class="app-week-day${index < 3 ? " is-complete" : ""}${index === 2 ? " is-current" : ""}"><span>${day}</span><i aria-hidden="true"></i></div>`).join("");
  const volume = [4.8, 5.4, 5.1, 6.2, 6.6, 6.1, 7.5, 8.4];
  const chart = volume.map((value, index) => `
    <div class="app-chart-bar" aria-label="Tuần ${index + 1}: ${String(value).replace(".", ",")} tấn" style="display:flex;align-items:flex-end;height:100%">
    <i style="display:block;width:100%;height:${value / 9 * 100}%;background:#B79BFF;opacity:${index === 7 ? 1 : .35 + index * .065};border-radius:4px 4px 1px 1px"></i></div>`).join("");

  window.LYRION_PREVIEWS = Object.freeze({
    welcome: screen("Tổng quan hôm nay", 0, `
      <p class="app-eyebrow">MỘT NGÀY MỚI</p><h3 class="app-heading">Chào An.</h3>
      <p class="app-muted" style="margin:5px 0 18px;font-size:10px">Dành một chút hôm nay cho chính mình.</p>
      <div class="app-card"><div class="app-row"><span class="app-eyebrow">BUỔI TẬP TIẾP THEO</span><span class="app-muted">18:00</span></div>
        <strong style="display:block;font-size:20px;margin:11px 0 6px;font-weight:550">Thân trên A</strong>
        <p class="app-muted" style="margin:0;font-size:10px">4 bài tập · Khoảng 42 phút</p>
        <span class="app-action" style="margin-top:16px">Xem buổi tập</span></div>
      <h4 class="app-section-title">Năng lượng hôm nay</h4>
      <div class="app-card app-row" style="gap:12px">${ring(70.48, "1.480", "kcal")}
        <div style="flex:1"><strong style="font-size:15px;font-weight:500">Còn 620 kcal</strong>
          <p class="app-muted" style="margin:5px 0 0;font-size:10px">Mục tiêu 2.100 kcal</p>
          <p class="app-muted" style="margin:8px 0 0;font-size:9px">Đạm 120 g · Carb 160 g</p></div></div>
      <div class="app-row" style="margin-top:16px"><h4 class="app-section-title" style="margin:0">Nhịp tập tuần này</h4><span class="app-muted" style="font-size:10px">3 / 4 buổi</span></div>
      <div class="app-week">${week}</div>
    `),
    workout: screen("Buổi tập thân trên", 1, `
      <p class="app-eyebrow">LỊCH TẬP CỦA BẠN</p><h3 class="app-heading">Thân trên A</h3>
      <p class="app-muted" style="margin:7px 0 18px;font-size:10px">4 bài tập · Khoảng 42 phút</p>
      <div class="app-card"><div class="app-row"><span class="app-muted" style="font-size:10px">Khối lượng gợi ý</span><strong style="color:#B79BFF">12 hiệp</strong></div>
        <p class="app-muted" style="margin:7px 0 0;font-size:9px">Dựa trên buổi tập gần nhất của bạn.</p></div>
      <h4 class="app-section-title">Bài tập hôm nay</h4>
      <div>${exercise("01", "Đẩy ngực tạ đòn", 40)}${exercise("02", "Kéo xô", 35)}${exercise("03", "Đẩy vai tạ đơn", 12)}${exercise("04", "Kéo cáp ngồi", 30)}</div>
      <p class="app-muted" style="font-size:9px;margin:12px 0 16px">Thời gian nghỉ: 90 giây giữa các hiệp.</p>
      <span class="app-action">Bắt đầu buổi tập</span>
    `),
    nutrition: screen("Nhật ký dinh dưỡng", 2, `
      <p class="app-eyebrow">THỨC ĂN & NĂNG LƯỢNG</p><h3 class="app-heading">Dinh dưỡng</h3>
      <div class="app-row" style="gap:13px;margin:12px 0">
        ${ring(70.48, "1.480", "/ 2.100 kcal", 94)}
        <div style="flex:1"><strong style="font-size:18px;font-weight:500">620 kcal</strong><p class="app-muted" style="margin:4px 0 0;font-size:10px">còn lại hôm nay</p>
          <p style="color:#B79BFF;font-size:9px;margin:10px 0 0">Đã ghi nhận 3 bữa</p></div></div>
      <div style="display:grid;gap:10px">${macro("Đạm", 120, 140)}${macro("Carb", 160, 240)}${macro("Chất béo", 40, 65)}</div>
      <h4 class="app-section-title" style="margin:18px 0 4px">Bữa ăn hôm nay</h4>
      ${meal("Bữa sáng", "Yến mạch, sữa chua, chuối", 390)}
      ${meal("Bữa trưa", "Cơm gà và rau củ", 640)}
      ${meal("Bữa phụ", "Bánh mì trứng, sữa", 450)}
      <div class="app-entry-options" aria-label="Các cách ghi lại bữa ăn"><span>Ảnh</span><span>Nhãn</span><span>Văn bản</span><span>Giọng nói</span></div>
    `),
    progress: screen("Tiến độ tập luyện", 0, `
      <p class="app-eyebrow">TỪNG CHÚT, MỖI NGÀY</p><h3 class="app-heading" style="font-size:24px">Bạn đang tiến bộ.</h3>
      <div class="app-streak app-row" style="margin-top:17px"><div><strong style="display:block;font-size:25px;color:#FFE0A3;font-weight:500">4 tuần</strong>
        <span style="font-size:9px;color:#FFE0A3">duy trì lịch tập liên tiếp</span></div><span style="font-size:9px;color:#FFE0A3">Đều đặn hơn.</span></div>
      <div class="app-row" style="margin-top:16px"><h4 class="app-section-title" style="margin:0">Khối lượng tập</h4><span class="app-muted" style="font-size:9px">8 tuần</span></div>
      <div class="app-row" style="align-items:baseline;margin:8px 0 10px"><strong style="font-size:28px;letter-spacing:-1px;font-weight:500">8,4 <span class="app-muted" style="font-size:12px">tấn</span></strong>
        <span style="color:#B79BFF;font-size:9px">+12% so với tuần trước</span></div>
      <div class="app-chart" style="display:grid;grid-template-columns:repeat(8,1fr);gap:9px;height:65px">${chart}</div>
      <div class="app-chart-labels" style="display:grid;grid-template-columns:repeat(8,1fr);gap:9px;margin-top:7px;text-align:center">${volume.map((_, index) => `<span>S${index + 1}</span>`).join("")}</div>
      <h4 class="app-section-title" style="margin-top:16px">Nhịp phục hồi</h4>
      <div class="app-card" style="padding-top:4px;padding-bottom:4px"><div class="app-recovery app-row"><span class="app-muted">Sau buổi tập gần nhất</span><strong>36 giờ</strong></div>
        <div class="app-recovery app-row"><span class="app-muted">Ngày nghỉ trong tuần</span><strong>2 ngày</strong></div></div>
    `)
  });
})();
