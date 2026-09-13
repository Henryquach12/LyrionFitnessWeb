# LyrionFitness

Landing page cho ứng dụng tập gym và theo dõi calo LyrionFitness. HTML, CSS, JavaScript và máy chủ Node.js, không cần cài thư viện.

## Xem trang

Dùng Node.js 22 trở lên:

```sh
npm start
```

Mở http://127.0.0.1:4173. Chưa cần Supabase để xem giao diện. Mở trực tiếp `index.html` cũng xem được trang, nhưng đăng ký waitlist cần chạy qua máy chủ.

## Kết nối waitlist với Supabase

1. Trong dự án Supabase của bạn, mở **SQL Editor** và chạy `supabase/waitlist.sql`. File tạo bảng PostgreSQL `public.waitlist_signups`, email duy nhất, bật Row Level Security và chặn quyền đọc/ghi công khai.
2. Sao chép `.env.example` thành `.env` trong thư mục gốc.
3. Điền **Project URL** vào `SUPABASE_URL` và **secret key** vào `SUPABASE_SECRET_KEY`. Lấy key trong **Settings → API Keys**. Hai vị trí này được ghi rõ trong file mẫu.
4. Chạy lại `npm start`. Gửi thử tên và email, rồi kiểm tra bản ghi trong **Table Editor → waitlist_signups**.

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=YOUR_SUPABASE_SECRET_KEY
```

Đây chỉ là placeholder. Không đặt khóa bí mật trong `config.js`, HTML hoặc JavaScript trình duyệt. `.env` và `.env.*` đã được bỏ qua trong Git; chỉ `.env.example` được giữ. Máy chủ cũng chặn truy cập các file môi trường, mã backend, SQL, công cụ kiểm tra và ZIP qua HTTP.

Form gửi JSON đến `POST /api/waitlist` trên cùng tên miền. Máy chủ kiểm tra tên/email rồi gửi đến Supabase bằng khóa riêng. Tên, email, thời điểm đăng ký và nguồn được lưu; email được chuẩn hóa chữ thường. Đăng ký lại cùng email không tạo dòng mới và không sửa tên của người đã đăng ký. Không có API công khai để lấy danh sách người đăng ký.

Khóa `sb_secret_…` được gửi qua header `apikey`; chỉ khóa `service_role` JWT cũ dùng thêm `Authorization: Bearer`. Nếu cần khóa cũ, để `SUPABASE_SECRET_KEY` trống và điền `SUPABASE_SERVICE_ROLE_KEY`. Xem [tài liệu API keys của Supabase](https://supabase.com/docs/guides/getting-started/api-keys) và [cơ chế chống trùng của PostgREST](https://docs.postgrest.org/en/stable/references/api/tables_views.html#upsert).

Chưa cấu hình: API trả `503`, form báo đăng ký chưa mở và giữ dữ liệu để thử lại. Chỉ báo thành công khi Supabase chấp nhận yêu cầu. Mã này lưu danh sách chờ; việc gửi email thông báo ra mắt được thực hiện sau từ danh sách đó.

## Thêm link App Store

Trong `config.js`, điền URL HTTPS chính thức vào `appStoreUrl`. Ví dụ định dạng:

```js
appStoreUrl: "https://apps.apple.com/vn/app/lyrionfitness/id123456789"
```

ID trên chỉ minh họa định dạng; thay bằng URL thật của bạn. Khi để trống, trang hiển thị “Sắp có trên App Store”; nút tải chưa được bật. Khi thêm URL hợp lệ từ apps.apple.com, nút tải và nội dung trạng thái tự cập nhật.

`launchOffer` là nội dung ưu đãi tùy chọn. Có thể nhập “Trải nghiệm demo miễn phí trong 3 tháng.” sau khi xác nhận điều kiện ra mắt. Mặc định để trống vì ứng dụng đang ở giai đoạn sắp ra mắt.

## Thay bốn màn hình app

Chép ảnh dọc của app vào `assets/`, rồi điền đường dẫn tương đối trong `config.js`:

```js
screenshots: {
  welcome: "assets/welcome.png",
  workout: "assets/workout.png",
  nutrition: "assets/nutrition.png",
  progress: "assets/progress.png"
}
```

Ảnh được dùng đồng bộ ở hero, phần giới thiệu và cửa sổ phóng to. Khuyến nghị ảnh dọc có tỷ lệ gần 274:594. Ảnh giữ nguyên tỷ lệ, không cắt nội dung. Nếu để trống hoặc ảnh lỗi, trang dùng giao diện minh họa có sẵn.

Logo đang dùng đúng ba file có sẵn: `lyrion-icon.png`, `lyrion-mark.png`, `lyrion-hero.png`.

## Thay nhận xét và ảnh đại diện

`config.js` có 4 mục trong `reviews`. Điền `name`, `detail`, `text`, `avatar` cho từng mục. Để trống sẽ giữ nội dung có sẵn. Ví dụ một mục:

```js
{ name: "Tên người dùng", detail: "Thông tin ngắn", text: "Phản hồi đã được cho phép sử dụng", avatar: "assets/reviews/nguoi-dung.jpg" }
```

Thêm ảnh vào `assets/`; hỗ trợ PNG, JPG, WebP và AVIF. Khi ảnh trống hoặc tải lỗi, trang dùng chữ viết tắt của tên. Ba nhận xét xuất hiện cùng lúc: `1,2,3 → 2,3,4 → 3,4,1 → 4,1,2 → 1,2,3`. Màn hình nhỏ xếp ba thẻ theo chiều dọc, nút mũi tên vẫn hoạt động bằng chạm và bàn phím. Không tự chạy.

## Chỉnh sửa

- `index.html`: nội dung tiếng Việt và cấu trúc trang.
- `styles.css`: bảng màu Apex, layout desktop/mobile, chuyển động, màn hình minh họa.
- `previews.js`: bốn giao diện minh họa và dữ liệu mẫu.
- `script.js`: menu mobile, tab giải thích thuật toán, phóng to ảnh, bàn phím và cấu hình phát hành.
- `motion.js`: tỷ lệ ảnh hero theo vị trí cuộn.
- `intro.css`, `intro.js`: màn hình logo khi tải trang và chuyển tiếp vào nội dung chính.
- `reviews.js`: xoay vòng bốn nhận xét, thay nội dung và ảnh đại diện.
- `waitlist.js`: gửi form, thông báo đang gửi/thành công/lỗi và cho phép thử lại.
- `config.js`: cấu hình công khai cho App Store, ưu đãi, ảnh và nhận xét.
- `server.mjs`: phục vụ trang và API waitlist.
- `waitlist-api.mjs`: kiểm tra yêu cầu và ghi Supabase từ máy chủ.
- `.env.example`: chỗ điền cấu hình Supabase phía máy chủ.
- `supabase/waitlist.sql`: bảng PostgreSQL và quyền truy cập.
- `tools/verify.mjs`: kiểm tra trình duyệt bằng Chrome cài sẵn, không cần thư viện.
- `tools/waitlist.test.mjs`: kiểm tra API với phản hồi Supabase mô phỏng.

Các màn hình và số liệu giao diện là minh họa. Xác nhận nội dung tính năng với bản app phát hành thực tế trước khi công bố.

## Kiểm tra

```sh
npm run check
npm run test:api
npm run test:browser
```

Kiểm tra trình duyệt cần Google Chrome trên Windows; có thể đặt biến `CHROME_PATH` nếu Chrome ở vị trí khác. Ảnh desktop/mobile và báo cáo ghi trong `artifacts/`. Các kiểm tra API dùng phản hồi mô phỏng, không kết nối dự án Supabase thật. Việc lưu thật cần được xác nhận sau khi bạn điền cấu hình và chạy SQL.

## Đưa lên hosting

Để form hoạt động, dùng hosting có Node.js 22+, chạy `npm start`, không cần bước build. Đặt `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SITE_URL` và `HOST=0.0.0.0` trong phần biến môi trường của hosting. `SITE_URL` là origin HTTPS chính xác của trang, ví dụ `https://lyrionfitness.com`. Dùng cổng `PORT` mà hosting cấp. Đổi `og:image` thành URL tuyệt đối khi có tên miền.

Giới hạn trong bộ nhớ là 30 yêu cầu / địa chỉ kết nối / 10 phút, có giới hạn dung lượng body và trường bẫy bot. Sau reverse proxy hoặc khi chạy nhiều máy chủ, đặt thêm rate limit tại hosting; mã không tin `X-Forwarded-For` từ khách truy cập. Dữ liệu form và lỗi chi tiết của Supabase không được ghi vào log hay trả ra trình duyệt.

Hosting thuần tĩnh chỉ hiển thị giao diện; cần triển khai API Node cùng origin hoặc chuyển route sang backend tương đương để lưu đăng ký. Không tải `.env` lên thư mục phục vụ file tĩnh.

## Font và chuyển động

Trang và màn hình app minh họa dùng Be Vietnam Pro, với các độ đậm 400, 500, 600 và 700 được lưu cục bộ trong `assets/`. Khách truy cập không phải tải font từ Google.

Hero ở đầu trang, hai ảnh phóng 7,5% từ điểm neo phía dưới rồi về tỷ lệ gốc khi cuộn xuống. Trở về đầu trang sẽ khôi phục tỷ lệ lớn. Hover ảnh nhấc nhẹ lên trong 250 ms với `--ease-out` có sẵn.

Mỗi lần mở hoặc tải lại trang, logo có sẵn `assets/lyrion-mark.png` xuất hiện ở giữa trên nền hiện tại. Logo giữ nguyên trong 3.000 ms rồi lớp intro mờ dần trong 500 ms để hiện trang chính; chế độ giảm chuyển động dùng 160 ms cho phần chuyển tiếp. Khi JavaScript bị tắt, trang chính hiển thị bình thường.

Nền giữ gradient và bảng màu hiện tại. Các đường nền SVG, vệt chuột và lớp sáng trang trí đã được gỡ.

Phần nhận xét dùng nền trắng, chữ đen và nút chuyển màu đen. Chuyển nhận xét vẫn dùng opacity/transform trong 200 ms; thao tác bàn phím đổi tức thì.

Thành phần xuất hiện một lần khi đi sâu hơn vào khung nhìn (cách đáy 80 px, ngưỡng 12%). Chuyển động đi lên 20 px với opacity trong 480 ms, dùng `--ease-out`; các thành phần cùng nhóm lệch nhau 60 ms, độ trễ từ 80 đến 260 ms. Heading, thẻ, form và từng hàng FAQ được chia thành các đơn vị riêng để tránh xuất hiện cùng lúc hoặc chồng nhiều transform. Focus bàn phím, chuyển nhận xét và liên kết điều hướng bằng bàn phím làm nội dung cần dùng hiện ngay.

Chế độ giảm chuyển động bỏ co giãn theo cuộn và độ trễ xuất hiện. Hover không chạy trên thiết bị cảm ứng. Không cài thêm thư viện animation.
