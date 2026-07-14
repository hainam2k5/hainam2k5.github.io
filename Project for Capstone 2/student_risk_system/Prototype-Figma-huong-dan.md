# Dựng Prototype trong Figma — Student Risk Alert System

Mình đã cắt sẵn **16 frame** (mỗi màn 1 ảnh, đã crop gọn) trong thư mục **`Figma-frames/`**:

- **Student (8):** `student-01-log-in` → `student-08-email-notifications`
- **Advisor (8):** `advisor-01-log-in` → `advisor-08-evaluation`

Việc của bạn chỉ là: kéo ảnh vào Figma → biến mỗi ảnh thành 1 Frame → nối link bấm chạy. Mất ~15 phút.

---

## Bước 1 — Đưa frame vào Figma

1. Mở **figma.com** → tạo file Design mới.
2. Mở thư mục `Figma-frames/` trên máy → **kéo–thả cả loạt ảnh** vào canvas Figma (kéo riêng nhóm student, riêng nhóm advisor cho gọn).
3. Chọn **tất cả ảnh** (`Ctrl/Cmd + A`) → nhấn **`Ctrl/Cmd + Alt + G`** (*Frame selection*) — mỗi ảnh thành **1 Frame** ôm khít.
4. Đổi tên frame theo tên ảnh (F2) và xếp thành 1 hàng theo thứ tự 01 → 08 cho dễ nối.

> Mẹo: đặt 2 hàng — hàng trên là luồng **Student**, hàng dưới là luồng **Advisor**.

## Bước 2 — Bật chế độ Prototype & nối link

1. Chọn 1 frame → góc phải trên đổi tab **Design → Prototype**.
2. Rê chuột lên vùng cần bấm (vd nút **Sign in**) → xuất hiện **chấm tròn xanh** ở mép → **kéo sợi dây** sang frame đích.
3. Ở bảng hiện ra chọn: **On click** → **Navigate to** → *(frame đích)* → hiệu ứng **Instant** hoặc **Dissolve**.
4. Chỗ nào không có nút rõ ràng (vd một dòng trong bảng) → vẽ 1 **hình chữ nhật trong suốt** (Opacity 0) đè lên vùng đó rồi nối dây từ hình đó.
5. Chọn frame **01 Log in** → trong tab Prototype bấm **Flag** (*Flow starting point*) để đặt màn bắt đầu.
6. Bấm **Present ▶** (góc phải trên) để bấm chạy thử. Chia sẻ bằng **Share → Copy prototype link**.

---

## Bản đồ nối link — LUỒNG STUDENT

| Từ frame | Bấm vào | → Sang frame |
|---|---|---|
| 01 Log in | nút **Sign in** | 03 Dashboard |
| 01 Log in | **Forgot password?** | 02 Forgot password |
| 02 Forgot password | **Update password** | 03 Dashboard |
| 02 Forgot password | **← Back to login** | 01 Log in |
| 03 Dashboard | khối **Transcript by semester** / *Print transcript* | 04 Transcript |
| 03 Dashboard | khối **Notifications** | 05 Notifications |
| 03 Dashboard | khối **Advisor Q&A** | 06 Advisor chat |
| 03 Dashboard | khối **Appointments** | 07 Appointments |
| 03 Dashboard | **Log out** | 01 Log in |
| 04 / 05 / 06 / 07 | (vẽ hotspot ở tiêu đề) → dùng **Back** | 03 Dashboard |
| 05 Notifications | dòng **Risk alert** *(tuỳ chọn)* | 08 Email notifications |

*Frame 08 (email) là ảnh minh hoạ các email sinh viên nhận — để tham khảo, không bắt buộc nối.*

## Bản đồ nối link — LUỒNG ADVISOR

Sidebar (Overview · Students · Alerts & interventions · Messages · Evaluation) xuất hiện ở frame 03–08, nên nối các mục sidebar giống nhau trên mỗi frame.

| Từ frame | Bấm vào | → Sang frame |
|---|---|---|
| 01 Log in | **Sign in** | 03 Dashboard |
| 01 Log in | **Forgot password?** | 02 Forgot password |
| 02 Forgot password | **Update password** | 03 Dashboard |
| 02 Forgot password | **← Back to login** | 01 Log in |
| 03 Dashboard | sidebar **Students** | 04 Students |
| 03 Dashboard | sidebar **Alerts & interventions** | 06 Alerts & interventions |
| 03 Dashboard | sidebar **Messages** | 07 Messages |
| 03 Dashboard | sidebar **Evaluation** | 08 Evaluation |
| 03 Dashboard | **Log out** | 01 Log in |
| 04 Students | sidebar **Overview** | 03 Dashboard |
| 04 Students | một **dòng sinh viên** (vd Hoang Van Em) | 05 Student detail |
| 04 Students | sidebar Alerts / Messages / Evaluation | 06 / 07 / 08 |
| 05 Student detail | **← Students** | 04 Students |
| 06 Alerts & interventions | sidebar Overview / Students / Messages / Evaluation | 03 / 04 / 07 / 08 |
| 06 Alerts & interventions | một **dòng cảnh báo** | 05 Student detail |
| 07 Messages | sidebar Overview / Students / Alerts / Evaluation | 03 / 04 / 06 / 08 |
| 08 Evaluation | sidebar Overview / Students / Alerts / Messages | 03 / 04 / 06 / 07 |

---

## Cách khác — nhập bản CHỈNH SỬA ĐƯỢC (nâng cao)

Nếu muốn frame có layer sửa được (không phải ảnh tĩnh): dùng plugin **html.to.design** → *Import from URL* với 2 link (đã live):

```
https://hainam2k5.github.io/Project%20for%20Capstone%202/student_risk_system/Wireframe-Student.html
https://hainam2k5.github.io/Project%20for%20Capstone%202/student_risk_system/Wireframe-Advisor.html
```

Nhược điểm: mỗi file nhập thành **1 frame dài** (8 màn xếp dọc) → phải tự tách từng `section` thành frame riêng trước khi nối link. Với mục đích prototype bấm-chạy, cách **ảnh-thành-frame** ở trên nhanh và gọn hơn.
