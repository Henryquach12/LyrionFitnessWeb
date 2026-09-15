# LyrionFitness

Trang giới thiệu LyrionFitness, đăng ký sớm và hướng dẫn tham gia TestFlight. HTML, CSS, JavaScript và máy chủ Node.js, không cần cài thư viện.

## Xem trang

Dùng Node.js 22 trở lên:

```sh
cd public
npm start
```

Mở http://127.0.0.1:4173. Chưa cần Supabase để xem giao diện. Mở trực tiếp `index.html` cũng xem được trang, nhưng đăng ký waitlist cần chạy qua máy chủ.

Trang chính sách bảo mật được phục vụ tại `/policy` từ `public/policy.html`, cùng bản với `../policy/index.html`. Link nằm dưới thông tin liên hệ trên trang chính và trang tester, đồng thời có trong thông báo đồng ý nhận email tại form đăng ký. Link mở tab mới để người đọc xem chính sách mà vẫn giữ thông tin đang nhập.

## Kết nối waitlist với Supabase

1. Kiểm tra cấu trúc hiện có bằng `../supabase/inspect-waitlist.sql` trong **SQL Editor**. Nếu chưa có bảng đăng ký phù hợp, chạy `../supabase/waitlist.sql`. File tạo `public.waitlist_signups` với email duy nhất, bật Row Level Security và chặn quyền đọc/ghi công khai. Nếu đã có bảng phù hợp khác, điều chỉnh endpoint theo bảng đó trước khi tạo mới.
2. Dùng `.env` trong thư mục gốc của repository (cùng cấp với `public/`). Máy chủ đọc file này dù chạy từ `public/`; biến môi trường hosting được ưu tiên.
3. Điền **Project URL** vào `SUPABASE_URL` và **secret key** vào `SUPABASE_SECRET_KEY`. Lấy key trong **Settings → API Keys**. File `../.env.example` ghi rõ các biến cần dùng.
4. Chạy lại `npm start`. Gửi thử tên và email, rồi kiểm tra bản ghi trong **Table Editor → waitlist_signups**.

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=YOUR_SUPABASE_SECRET_KEY
```

Đây chỉ là placeholder. Không đặt khóa bí mật trong `config.js`, HTML hoặc JavaScript trình duyệt. `.env` và `.env.*` đã được bỏ qua trong Git; chỉ `.env.example` được giữ. Máy chủ cũng chặn truy cập các file môi trường, mã backend, SQL, công cụ kiểm tra và ZIP qua HTTP.

Form gửi JSON đến `POST /api/waitlist` trên cùng tên miền. Máy chủ kiểm tra tên/email rồi gửi đến Supabase bằng khóa riêng. Tên, email, thời điểm đăng ký và nguồn được lưu; email được chuẩn hóa chữ thường. Đăng ký lại cùng email không tạo dòng mới và không sửa tên của người đã đăng ký. Không có API công khai để lấy danh sách người đăng ký.

Khóa `sb_secret_…` được gửi qua header `apikey`; chỉ khóa `service_role` JWT cũ dùng thêm `Authorization: Bearer`. Nếu cần khóa cũ, để `SUPABASE_SECRET_KEY` trống và điền `SUPABASE_SERVICE_ROLE_KEY`. Xem [tài liệu API keys của Supabase](https://supabase.com/docs/guides/getting-started/api-keys) và [cơ chế chống trùng của PostgREST](https://docs.postgrest.org/en/stable/references/api/tables_views.html#upsert).

Chưa cấu hình: API trả `503`, form báo đăng ký chưa mở và giữ dữ liệu để thử lại. Chỉ báo thành công khi Supabase chấp nhận yêu cầu. Mã này lưu danh sách chờ; việc gửi email thông báo ra mắt được thực hiện sau từ danh sách đó.

## Đăng ký sớm và TestFlight

Trang chính có thứ tự: chào mừng → tính năng → cá nhân hóa → đánh giá → đăng ký sớm → hỏi đáp. Nút chính “Đăng ký sớm” cuộn đến `#waitlist`. “Trở thành tester” trong menu mở `tester.html` ở tab mới.

Trang hướng dẫn đi thẳng từ phần giới thiệu vào năm bước theo thứ tự cài TestFlight, nhận lời mời, cài LyrionFitness, cập nhật, gửi phản hồi và phần xử lý sự cố. Liên kết tài liệu chính thức của Apple nằm trong mục “Không cài được ứng dụng” để đọc thêm khi cần. Trang không có thanh điều hướng riêng; liên kết về trang chủ nằm ở footer. Các bước vẫn hỗ trợ liên kết trực tiếp và bàn phím.

Ảnh App Store được cắt bằng CSS. Các màn hình ứng dụng khác được dựng bằng HTML/CSS với logo Lyrion trên nền tím, không còn tên app, phiên bản hay dữ liệu không liên quan. Các hình là minh họa có mô tả truy cập, không phải nút hay form hoạt động trên website. Không có thanh chú thích đen dưới ảnh. Bước gửi phản hồi minh họa nơi chọn Send Beta Feedback, lựa chọn gửi ảnh và màn hình nhập nội dung với Submit; ảnh được chọn trước khi viết phản hồi, không thêm nút đính kèm không có trong luồng iPhone.

Nội dung được đối chiếu tài liệu Apple ngày 14/09/2026:

- [Hướng dẫn TestFlight cho người thử nghiệm](https://testflight.apple.com/): email và liên kết công khai, cài đặt, cập nhật, phản hồi và ảnh chụp màn hình.
- [TestFlight trên App Store](https://apps.apple.com/app/testflight/id899247664) và [tải ứng dụng trên iPhone](https://support.apple.com/guide/iphone/get-apps-iphc90580097/ios): yêu cầu TestFlight và Apple Account; phiên bản Lyrion có thể yêu cầu iOS cao hơn.
- [Tester nội bộ](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/) và [mời tester bên ngoài](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/): phân biệt nhóm nội bộ với người nhận email hoặc liên kết công khai; giới hạn và điều kiện của lời mời.
- [Trạng thái build](https://developer.apple.com/help/app-store-connect/reference/app-uploads/app-build-statuses) và [ngừng thử nghiệm build](https://developer.apple.com/help/app-store-connect/test-a-beta-version/stop-testing-a-build/): thời hạn và bản không còn khả dụng.
- [Điều khoản TestFlight](https://www.apple.com/legal/internet-services/itunes/testflight/) và [phản hồi của tester](https://developer.apple.com/help/app-store-connect/test-a-beta-version/view-tester-feedback/): crash log tự động và phản hồi do người dùng gửi thêm. Hướng dẫn không yêu cầu người thử nghiệm mở App Store Connect.

Chưa có lời mời: các nút đăng ký trên trang hướng dẫn dẫn về `/#waitlist`. Khi có liên kết mời thật, điền `testFlightUrl` trong `config.js` theo dạng `https://testflight.apple.com/join/...`. Chỉ URL HTTPS trên tên miền TestFlight chính thức được bật. Không đặt thông tin bí mật trong cấu hình công khai.

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

`config.js` có 4 mục trong `reviews`. Điền `name`, `detail`, `text`, `avatar`, `rating` cho từng mục. Để trống nội dung sẽ giữ nội dung có sẵn; `rating` nhận 4 hoặc 5. Ví dụ một mục:

```js
{ name: "Tên người dùng", detail: "Thông tin ngắn", text: "Phản hồi đã được cho phép sử dụng", avatar: "assets/reviews/nguoi-dung.jpg", rating: 5 }
```

Thêm ảnh vào `assets/`; hỗ trợ PNG, JPG, WebP và AVIF. Khi ảnh trống hoặc tải lỗi, trang dùng chữ viết tắt của tên. Ba nhận xét xuất hiện cùng lúc: `1,2,3 → 2,3,4 → 3,4,1 → 4,1,2 → 1,2,3`. Màn hình nhỏ xếp ba thẻ theo chiều dọc, nút mũi tên vẫn hoạt động bằng chạm và bàn phím. Không tự chạy.

## Chỉnh sửa

- `index.html`: nội dung tiếng Việt và cấu trúc trang.
- `styles.css`: bảng màu Apex, layout desktop/mobile, chuyển động, màn hình minh họa.
- `glass.css`: chất liệu kính dùng chung cho nền thẻ, bảng, điều hướng và điều khiển trên cả hai trang.
- `previews.js`: bốn giao diện minh họa và dữ liệu mẫu.
- `script.js`: menu mobile, tab giải thích thuật toán, phóng to ảnh và bàn phím.
- `motion.js`: tỷ lệ ảnh hero theo vị trí cuộn.
- `intro.css`, `intro.js`: màn hình logo khi tải trang và chuyển tiếp vào nội dung chính.
- `reviews.js`: xoay vòng bốn nhận xét, thay nội dung và ảnh đại diện.
- `waitlist.js`: gửi form, thông báo đang gửi/thành công/lỗi và cho phép thử lại.
- `config.js`: cấu hình công khai cho lời mời TestFlight, ảnh và nhận xét.
- `tester.html`, `tester.css`, `tester.js`: hướng dẫn năm bước tham gia thử nghiệm.
- `server.mjs`: phục vụ trang và API waitlist.
- `waitlist-core.mjs`: kiểm tra yêu cầu và ghi Supabase, dùng chung cho Node và Cloudflare.
- `waitlist-api.mjs`: adapter HTTP cho Node.
- `worker.mjs`, `wrangler.toml`: API và cấu hình Cloudflare Workers.
- `site-files.mjs`, `tools/build-assets.mjs`: danh sách file công khai và bước chuẩn bị `dist/` để triển khai.
- `../.env`: cấu hình Supabase phía máy chủ, không được commit.
- `../supabase/inspect-waitlist.sql`: kiểm tra metadata bảng hiện có, không đọc email.
- `../supabase/waitlist.sql`: bảng PostgreSQL và quyền truy cập.
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

Cloudflare Workers dùng `public/wrangler.toml` với một Worker xử lý `/api/waitlist`. Bước build tự chép các file công khai trong `site-files.mjs` cùng ảnh và font vào `public/dist/`, gồm cả trang tester, sitemap, robots và file xác minh Google. Mã backend, công cụ và `.env` không được chép vào thư mục này. Từ thư mục gốc, triển khai bằng `wrangler deploy --config public/wrangler.toml`. Thư mục `dist/` được tạo lại khi build và không được commit.

Đặt `SUPABASE_URL` và `SUPABASE_SECRET_KEY` trong **runtime secrets** của Worker `lyrionfitnessweb`. File `.env` cục bộ và biến môi trường của bước build không tự trở thành runtime secrets. `SITE_URL` tùy chọn có thể khóa origin chính xác; nếu để trống, Worker chỉ nhận origin cùng URL yêu cầu. Bảng Supabase cũng phải sẵn sàng trước khi đăng ký hoạt động.

Nếu dùng hosting Node.js 22+, chạy `npm start` từ `public/`, không cần bước build. Đặt `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SITE_URL` và `HOST=0.0.0.0` trong phần biến môi trường của hosting. `SITE_URL` là origin HTTPS chính xác của trang, ví dụ `https://lyrionfitness.com`. Dùng cổng `PORT` mà hosting cấp.

Giới hạn trong bộ nhớ là 30 yêu cầu / địa chỉ kết nối / 10 phút, có giới hạn dung lượng body và trường bẫy bot. Sau reverse proxy hoặc khi chạy nhiều máy chủ, đặt thêm rate limit tại hosting; mã không tin `X-Forwarded-For` từ khách truy cập. Dữ liệu form và lỗi chi tiết của Supabase không được ghi vào log hay trả ra trình duyệt.

Hosting thuần tĩnh chỉ hiển thị giao diện; cần triển khai API Node cùng origin hoặc chuyển route sang backend tương đương để lưu đăng ký. Không tải `.env` lên thư mục phục vụ file tĩnh.

## Font và chuyển động

Trang và màn hình app minh họa dùng Be Vietnam Pro, với các độ đậm 400, 500, 600 và 700 được lưu cục bộ trong `assets/`. Khách truy cập không phải tải font từ Google.

Hero ở đầu trang, hai ảnh phóng 7,5% từ điểm neo phía dưới rồi về tỷ lệ gốc khi cuộn xuống. Trở về đầu trang sẽ khôi phục tỷ lệ lớn. Hover ảnh nhấc nhẹ lên trong 250 ms với `--ease-out` có sẵn.

Mỗi lần mở hoặc tải lại trang, logo có sẵn `assets/lyrion-mark.png` xuất hiện ở giữa trên nền hiện tại. Logo giữ nguyên trong 1.000 ms rồi lớp intro mờ dần trong 500 ms để hiện trang chính; chế độ giảm chuyển động dùng 160 ms cho phần chuyển tiếp. Khi JavaScript bị tắt, trang chính hiển thị bình thường.

Khi lớp logo bắt đầu mờ, cặp iPhone có sẵn tăng từ 72% lên kích thước cuối trong 2.400 ms. Trạng thái nhỏ được đặt trước khi hero xuất hiện, tránh chớp kích thước lớn; lớp chuyển động riêng giữ nguyên tỷ lệ khi cuộn và hover. Chế độ giảm chuyển động dùng opacity trong 200 ms.

Nền giữ gradient và bảng màu hiện tại. Các đường nền SVG, vệt chuột và lớp sáng trang trí đã được gỡ.

Phần nhận xét dùng nền của trang, tiêu đề trắng và từng thẻ kính trắng mờ với chữ tối, đánh giá 4–5 sao. Chữ nhận xét là 20 px trên desktop và 18 px ở màn hình nhỏ. Chuyển nhận xét dùng opacity/transform trong 200 ms; thao tác bàn phím đổi tức thì. FAQ dùng kính tối cho câu hỏi, kính xám sáng hơn cho câu trả lời và cỡ chữ 15–16 px.

Menu thêm “Trở thành tester” sau “Hỏi đáp” trên desktop và ở cuối danh sách mobile. Kích thước nút Menu và khoảng cách các mục mobile được giữ nguyên. Chất liệu kính dùng chung nền trong suốt, viền sáng nhẹ và bóng đổ trên thẻ, bảng, nút, form, điều hướng và trang TestFlight. Kính tối giữ nền tím của trang; kính sáng giữ chữ tối trên thẻ nhận xét và màn hình TestFlight. Chế độ giảm độ trong suốt hoặc tăng tương phản chuyển sang nền đặc và bỏ blur. Kiểm tra trình duyệt đối chiếu độ tương phản của chữ, placeholder và trạng thái gửi form trên các lớp nền kính, bên cạnh ảnh desktop/mobile.

Vùng trên cùng trên mobile, màu nền gốc và `theme-color` dùng chung `#251d38`; lớp nền hòa dần vào gradient hiện tại bên dưới menu. Trang dùng `viewport-fit=cover` và các giá trị `safe-area-inset-*` để phủ vùng notch nhưng vẫn đặt nội dung bên dưới mép an toàn, theo [hướng dẫn WebKit](https://webkit.org/blog/7929/designing-websites-for-iphone-x/). Kiểm tra trình duyệt mô phỏng được kích thước mobile và safe-area; giao diện thanh trạng thái của Safari cần đối chiếu trên iPhone thật.

Thành phần xuất hiện một lần khi đi sâu hơn vào khung nhìn (cách đáy 80 px, ngưỡng 12%). Chuyển động đi lên 20 px với opacity trong 480 ms, dùng `--ease-out`; các thành phần cùng nhóm lệch nhau 60 ms, độ trễ từ 80 đến 260 ms. Heading, thẻ, form và từng hàng FAQ được chia thành các đơn vị riêng để tránh xuất hiện cùng lúc hoặc chồng nhiều transform. Focus bàn phím, chuyển nhận xét và liên kết điều hướng bằng bàn phím làm nội dung cần dùng hiện ngay.

Chế độ giảm chuyển động bỏ co giãn theo cuộn và độ trễ xuất hiện. Hover không chạy trên thiết bị cảm ứng. Không cài thêm thư viện animation.

Ba lựa chọn cá nhân hóa giữ bố cục dọc trong một khung tối. Thanh nền được chọn trượt theo chiều dọc bằng `transform` trong 250 ms với `--ease-out`; bấm liên tiếp sẽ đổi hướng từ vị trí hiện tại. Điều hướng bàn phím và chế độ giảm chuyển động chuyển trạng thái ngay.
