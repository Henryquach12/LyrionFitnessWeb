/* Cấu hình công khai. Không đặt Supabase API key hoặc bí mật trong file này. */
window.LYRION_CONFIG = {
  // URL HTTPS tải app (App Store hoặc trang tải chính thức). Để trống để tạm vô hiệu hóa cả hai CTA.
  appStoreUrl: "",
  // Chỉ bật ưu đãi khi đã xác nhận điều kiện phát hành.
  launchOffer: "",
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
