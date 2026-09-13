# Ứng dụng Android – Ảnh học sinh LTV

Ứng dụng WebView chạy offline và dùng cùng mã giao diện với website. Khi build, Gradle tự sao chép các tệp web cần thiết vào APK.

## Tính năng Android

- Chọn CSV từ bộ nhớ thiết bị.
- Nhận CSV từ Downloads, Google Drive và các trình quản lý tệp dù thiết bị gán MIME là CSV, Excel, text hoặc binary.
- Camera trực tiếp trong app hoặc camera sau của điện thoại.
- Lưu JPEG vào `Pictures/LTV_Hoc_Sinh`.
- Ghi đè ảnh cũ có cùng mã học sinh.
- Tự khôi phục danh sách CSV, lớp/học sinh đang chọn, tiến độ đã chụp và trạng thái vắng sau khi đóng app.
- Giữ ảnh nháp chưa lưu trong bộ nhớ riêng của app để tránh mất khi app bị đóng giữa chừng.
- Đánh dấu/bỏ đánh dấu vắng ngay trong danh sách hoặc màn hình chụp.
- Hiển thị tiến độ dạng `20/30` và thông tin học sinh tiếp theo ở cuối màn hình chụp.
- Android 8.0 trở lên (`minSdk 26`).
- Target Android 16 (`targetSdk 36`).

## Build bằng Android Studio

1. Cài Android Studio và Android SDK Platform 36.
2. Mở thư mục `android` bằng Android Studio.
3. Chờ Gradle sync hoàn tất.
4. Chọn **Build → Build APK(s)**.

APK debug nằm tại `android/app/build/outputs/apk/debug/app-debug.apk`.

## Build trên GitHub

Workflow `build-android.yml` tự build khi mã Android hoặc mã web thay đổi. Trang Actions sẽ cung cấp artifact `LTV-Student-Photo-APK`. Khi push tag dạng `v1.0.0`, workflow đồng thời tạo GitHub Release công khai kèm APK.
