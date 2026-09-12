/* Cấu hình công khai. Không đặt Supabase API key hoặc bí mật trong file này. */
window.LYRION_CONFIG = {
  // Dán URL đầy đủ của app: https://apps.apple.com/.../id123456789
  appStoreUrl: "",
  // Chỉ bật ưu đãi khi đã xác nhận điều kiện phát hành.
  launchOffer: "",
  // Từng mục tương ứng nhận xét 1–4. Để trống để giữ nội dung có sẵn.
  // Ví dụ avatar: "assets/reviews/minh-thu.jpg". Ảnh lỗi sẽ về chữ viết tắt.
  reviews: [
    { name: "", detail: "", text: "", avatar: "" },
    { name: "", detail: "", text: "", avatar: "" },
    { name: "", detail: "", text: "", avatar: "" },
    { name: "", detail: "", text: "", avatar: "" }
  ],
  // Đường dẫn ảnh tương đối. Để trống sẽ dùng giao diện minh họa có sẵn.
  screenshots: {
    welcome: "",
    workout: "",
    nutrition: "",
    progress: ""
  }
};
