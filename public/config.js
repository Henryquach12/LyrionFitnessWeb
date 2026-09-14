/* Cấu hình công khai. Không đặt Supabase API key hoặc bí mật trong file này. */
window.LYRION_CONFIG = {
  // Liên kết mời https://testflight.apple.com/join/... chính thức khi mở thử nghiệm.
  // Để trống: trang hướng dẫn dẫn tới đăng ký sớm để nhận lời mời.
  testFlightUrl: "",
  // Từng mục tương ứng nhận xét 1–4. Để trống để giữ nội dung có sẵn.
  // Ví dụ avatar: "assets/reviews/minh-thu.jpg". Ảnh lỗi sẽ về chữ viết tắt.
  // Điểm đánh giá (rating) chỉ nhận 4 hoặc 5 sao.
  reviews: [
    { name: "", detail: "", text: "", avatar: "", rating: 5 },
    { name: "", detail: "", text: "", avatar: "", rating: 5 },
    { name: "", detail: "", text: "", avatar: "", rating: 4 },
    { name: "", detail: "", text: "", avatar: "", rating: 5 }
  ],
  // Đường dẫn ảnh tương đối. Để trống sẽ dùng giao diện minh họa có sẵn.
  screenshots: {
    welcome: "",
    workout: "",
    nutrition: "",
    progress: ""
  }
};
