# Web chụp ảnh học sinh

Web đọc trực tiếp file CSV gốc, chia học sinh theo lớp và lưu ảnh với tên `ma_hoc_sinh.jpg`. Dữ liệu CSV và ảnh chỉ được xử lý trong trình duyệt, không gửi lên máy chủ.

## Web online

https://trunghieu-tech.github.io/chup_anh_hoc_sinh/

## Ứng dụng Android

Mã nguồn Android nằm trong thư mục `android/`. App chạy offline, dùng cùng giao diện với web và lưu ảnh trực tiếp vào `Pictures/LTV_Hoc_Sinh` theo mã học sinh. App tự lưu danh sách, tiến độ, học sinh vắng và ảnh nháp chưa lưu để khôi phục khi mở lại. Mỗi lần cập nhật mã Android, GitHub Actions sẽ tạo APK thử nghiệm để tải về.

Cuối màn hình chụp luôn hiển thị tiến độ lớp dạng `đã xử lý/tổng số` và học sinh tiếp theo chưa chụp/chưa đánh dấu vắng.

## Chạy trên máy tính Windows

Nhấp đúp `start_web.bat`. Trình duyệt sẽ tự mở địa chỉ `http://localhost:4173`.

1. Chọn file CSV gốc.
2. Chọn thư mục lưu ảnh (Chrome/Edge).
3. Chọn lớp và học sinh.
4. Mở camera, chụp, xem lại rồi lưu ảnh.

## Dùng trên Android/iPhone/iPad

Giao diện tự chuyển sang chế độ điện thoại. Nút **Camera điện thoại** mở ứng dụng camera gốc, kể cả khi camera trực tiếp trong web không khả dụng.

- iPhone/iPad: sau khi chụp, bấm **Chia sẻ / Lưu ảnh**, sau đó chọn **Lưu vào Tệp** để giữ tên `ma_hoc_sinh.jpg`.
- Android: ảnh được tải xuống hoặc chia sẻ với tên `ma_hoc_sinh.jpg`, tùy trình duyệt.
- Camera trực tiếp (`getUserMedia`) trên điện thoại yêu cầu web chạy qua HTTPS. Vì vậy, để dùng đầy đủ trên nhiều điện thoại, hãy đưa thư mục web tĩnh này lên một dịch vụ HTTPS như GitHub Pages hoặc Cloudflare Pages.
- Nếu điện thoại và máy tính cùng Wi-Fi, địa chỉ mạng nội bộ được in trong cửa sổ chạy web. Ở địa chỉ HTTP này, nút **Camera điện thoại** vẫn là lựa chọn tương thích nhất; camera trực tiếp có thể bị trình duyệt chặn.

## Lưu ý về iOS

Safari không cho website tự ý ghi nhiều ảnh thẳng vào một thư mục. Đây là giới hạn bảo mật của iOS. Web dùng bảng Chia sẻ của hệ thống; chọn **Lưu vào Tệp** sẽ giữ đúng tên ảnh theo mã học sinh.
