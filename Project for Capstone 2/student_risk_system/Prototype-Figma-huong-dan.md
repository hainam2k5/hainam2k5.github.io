# Dựng Prototype trong Figma — Student Risk Alert System

Mình đã dựng sẵn **15 frame hi-fi** (giao diện **giống hệt web đã deploy** — theme navy/gold VNU-IS, card/KPI/bảng thật, không phải greybox) trong thư mục **`Figma-frames/`**:

- **Student (3):** `student-01-log-in`, `student-02-forgot-password`, `student-03-portal`
- **Advisor (9):** `advisor-01-log-in` → `advisor-09-evaluation` — trong đó `advisor-05-classes` là màn **Lớp học** (điểm danh + nhập điểm thành phần)
- **Teacher (3):** `teacher-01-log-in`, `teacher-02-forgot-password`, `teacher-03-classes` (tab Nhập điểm)

*(Cấu trúc khớp app thật: SV có 1 trang Portal tổng; cố vấn có 9 màn theo sidebar 6 mục — kiêm giáo viên nên có Lớp học; giáo viên thuần chỉ có màn Lớp học.)*

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

Sinh viên chỉ có 3 màn (Portal là 1 trang tổng chứa mọi thứ):

| Từ frame | Bấm vào | → Sang frame |
|---|---|---|
| 01 Log in | nút **Đăng nhập** | 03 Portal |
| 01 Log in | **Quên mật khẩu?** | 02 Forgot password |
| 02 Forgot password | **Cập nhật mật khẩu** | 03 Portal |
| 02 Forgot password | **← Quay lại đăng nhập** | 01 Log in |
| 03 Portal | **Đăng xuất** | 01 Log in |

*Trong màn 03 Portal, bảng điểm · thông báo · hỏi đáp · lịch hẹn đều nằm cùng trang (cuộn), giống hệt web thật — không cần tách frame.*

## Bản đồ nối link — LUỒNG ADVISOR

Sidebar 6 mục (Tổng quan · Sinh viên · **Lớp học** · Cảnh báo & Can thiệp · Tin nhắn · Đánh giá) xuất hiện ở frame 03–09 — nối các mục sidebar giống nhau trên mỗi frame.

| Từ frame | Bấm vào | → Sang frame |
|---|---|---|
| 01 Log in | **Đăng nhập** | 03 Dashboard |
| 01 Log in | **Quên mật khẩu?** | 02 Forgot password |
| 02 Forgot password | **Cập nhật mật khẩu** | 03 Dashboard |
| 02 Forgot password | **← Quay lại đăng nhập** | 01 Log in |
| 03 Dashboard | sidebar **Sinh viên** | 04 Students |
| 03 Dashboard | sidebar **Lớp học** | 05 Classes |
| 03 Dashboard | sidebar **Cảnh báo & Can thiệp** | 07 Alerts & interventions |
| 03 Dashboard | sidebar **Tin nhắn** | 08 Messages |
| 03 Dashboard | sidebar **Đánh giá** | 09 Evaluation |
| 03 Dashboard | **Đăng xuất** | 01 Log in |
| 04 Students | một **dòng sinh viên** (vd Hoàng Văn Em) | 06 Student detail |
| 04 Students | sidebar Tổng quan / Lớp học / Cảnh báo / Tin nhắn / Đánh giá | 03 / 05 / 07 / 08 / 09 |
| 05 Classes | tab **Nhập điểm** *(tuỳ chọn)* | 03 frame teacher-03 (cùng nội dung tab điểm) |
| 05 Classes | sidebar các mục khác | 03 / 04 / 07 / 08 / 09 |
| 06 Student detail | **← Danh sách sinh viên** | 04 Students |
| 07 Alerts & interventions | một **dòng cảnh báo** | 06 Student detail |
| 07 / 08 / 09 | sidebar các mục khác | 03 / 04 / 05 / … |

## Bản đồ nối link — LUỒNG TEACHER

Giáo viên (không phải cố vấn) chỉ có 3 màn — đăng nhập xong vào thẳng Lớp học:

| Từ frame | Bấm vào | → Sang frame |
|---|---|---|
| teacher-01 Log in | **Đăng nhập** | teacher-03 Classes |
| teacher-01 Log in | **Quên mật khẩu?** | teacher-02 Forgot password |
| teacher-02 | **Cập nhật mật khẩu** | teacher-03 Classes |
| teacher-03 Classes | tab **Điểm danh** *(tuỳ chọn)* | advisor-05 Classes (cùng nội dung tab điểm danh) |
| teacher-03 Classes | **Đăng xuất** | teacher-01 Log in |

---

## Cách khác — nhập bản CHỈNH SỬA ĐƯỢC (nâng cao)

Nếu muốn frame có layer sửa được (không phải ảnh tĩnh): dùng plugin **html.to.design** → *Import from URL* với 2 link (đã live):

```
https://hainam2k5.github.io/Project%20for%20Capstone%202/student_risk_system/Wireframe-Student.html
https://hainam2k5.github.io/Project%20for%20Capstone%202/student_risk_system/Wireframe-Advisor.html
https://hainam2k5.github.io/Project%20for%20Capstone%202/student_risk_system/Wireframe-Teacher.html
```

Nhược điểm: mỗi file nhập thành **1 frame dài** (8 màn xếp dọc) → phải tự tách từng `section` thành frame riêng trước khi nối link. Với mục đích prototype bấm-chạy, cách **ảnh-thành-frame** ở trên nhanh và gọn hơn.
