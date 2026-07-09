# Ảnh & logo Trường cho trang đăng nhập

Trang đăng nhập hiển thị **carousel ảnh Trường Quốc tế tự động đổi** ở panel bên trái,
và **logo + tên trường ở góc trên bên trái**. Hãy đặt các file ảnh thật vào đúng vị trí dưới đây.

## 1) Ảnh carousel (3–4 ảnh, tự đổi mỗi 5 giây)

Đặt các file này vào thư mục `webapp-next/public/school/`:

- `slide1.jpg`
- `slide2.jpg`
- `slide3.jpg`
- `slide4.jpg`

Gợi ý: ảnh **dọc hoặc ngang đều được**, khuyến nghị tối thiểu ~1200×1600 px, dung lượng < 500 KB/ảnh.
Chọn ảnh khuôn viên/cơ sở/hoạt động của Trường Quốc tế – ĐHQGHN.

> Nếu thiếu ảnh, panel vẫn hiển thị nền gradient (không bị vỡ ảnh). Muốn nhiều/ít hơn 4 ảnh,
> sửa mảng `SLIDES` trong `webapp-next/app/page.tsx`.

## 2) Logo + tên trường (góc trên bên trái)

Lưu ảnh logo Trường Quốc tế — chính là "ảnh 2" (khiên VNU-IS **kèm** tên trường) — thành file:

- `webapp-next/public/school-logo.png`  ← lưu ý: đặt ở thư mục `public/`, KHÔNG phải `public/school/`

Khi có file này, góc trên trái hiển thị **đúng nguyên ảnh đó** (đã gồm cả logo và tên trường),
đặt trên nền bo tròn trắng nhẹ để luôn đọc rõ trên ảnh. Nên dùng **PNG nền trong suốt** hoặc nền trắng.

Nếu THIẾU file này, hệ thống tự hiển thị huy hiệu chữ "VNU iS" + tên trường 3 dòng (Đại học Quốc gia
Hà Nội / Trường Quốc tế / VNU International School) — sửa các dòng chữ này trong `app/page.tsx` nếu cần.
