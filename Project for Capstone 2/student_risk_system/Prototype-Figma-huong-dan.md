# Dựng Prototype trong Figma — Student Risk Alert System

Mình đã dựng sẵn **17 frame hi-fi** (giao diện **giống hệt web đã deploy** — theme navy/gold VNU-IS, card/KPI/bảng thật, không phải greybox) trong thư mục **`Figma-frames/`**:

- **Student (3):** `student-01-log-in`, `student-02-forgot-password`, `student-03-portal`
- **Advisor (10):** `advisor-01-log-in` → `advisor-10-evaluation` — trong đó `advisor-05-attendance` là màn **Điểm danh** và `advisor-06-grades` là màn **Nhập điểm** (cố vấn kiêm giáo viên nên có 2 màn này)
- **Teacher (4):** `teacher-01-log-in`, `teacher-02-forgot-password`, `teacher-03-attendance` (Điểm danh), `teacher-04-grades` (Nhập điểm)

*(Cấu trúc khớp app thật: SV có 1 trang Portal tổng; cố vấn có 10 màn theo sidebar 7 mục — có **Điểm danh** và **Nhập điểm** tách riêng; giáo viên thuần có 2 màn Điểm danh + Nhập điểm.)*

Việc của bạn chỉ là: kéo ảnh vào Figma → biến mỗi ảnh thành 1 Frame → nối link bấm chạy. Mất ~15 phút.

---

## Bước 1 — Đưa frame vào Figma

1. Mở **figma.com** → tạo file Design mới.
2. Mở thư mục `Figma-frames/` trên máy → **kéo–thả cả loạt ảnh** vào canvas Figma (kéo riêng nhóm student, riêng nhóm advisor, riêng nhóm teacher cho gọn).
3. Chọn **tất cả ảnh** (`Ctrl/Cmd + A`) → nhấn **`Ctrl/Cmd + Alt + G`** (*Frame selection*) — mỗi ảnh thành **1 Frame** ôm khít.
4. Đổi tên frame theo tên ảnh (F2) và xếp thành 1 hàng theo thứ tự 01 → 10 cho dễ nối.

> Mẹo: đặt 3 hàng — hàng 1 luồng **Student**, hàng 2 luồng **Advisor**, hàng 3 luồng **Teacher**.

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

Sidebar 7 mục (Tổng quan · Sinh viên · **Điểm danh** · **Nhập điểm** · Cảnh báo & Can thiệp · Tin nhắn · Đánh giá) xuất hiện ở frame 03–10 — nối các mục sidebar giống nhau trên mỗi frame.

| Từ frame | Bấm vào | → Sang frame |
|---|---|---|
| 01 Log in | **Đăng nhập** | 03 Dashboard |
| 01 Log in | **Quên mật khẩu?** | 02 Forgot password |
| 02 Forgot password | **Cập nhật mật khẩu** | 03 Dashboard |
| 02 Forgot password | **← Quay lại đăng nhập** | 01 Log in |
| 03 Dashboard | sidebar **Sinh viên** | 04 Students |
| 03 Dashboard | sidebar **Điểm danh** | 05 Attendance |
| 03 Dashboard | sidebar **Nhập điểm** | 06 Grades |
| 03 Dashboard | sidebar **Cảnh báo & Can thiệp** | 08 Alerts & interventions |
| 03 Dashboard | sidebar **Tin nhắn** | 09 Messages |
| 03 Dashboard | sidebar **Đánh giá** | 10 Evaluation |
| 03 Dashboard | **Đăng xuất** | 01 Log in |
| 04 Students | một **dòng sinh viên** (vd Hoàng Văn Em) | 07 Student detail |
| 05 Attendance | sidebar **Nhập điểm** | 06 Grades |
| 06 Grades | sidebar **Điểm danh** | 05 Attendance |
| 05 / 06 | sidebar các mục khác | 03 / 04 / 08 / 09 / 10 |
| 07 Student detail | **← Danh sách sinh viên** | 04 Students |
| 08 Alerts & interventions | một **dòng cảnh báo** | 07 Student detail |
| 08 / 09 / 10 | sidebar các mục khác | 03 / 04 / 05 / 06 / … |

## Bản đồ nối link — LUỒNG TEACHER

Giáo viên (không phải cố vấn) có 4 màn, sidebar 2 mục (**Điểm danh** · **Nhập điểm**) — đăng nhập xong vào thẳng Điểm danh:

| Từ frame | Bấm vào | → Sang frame |
|---|---|---|
| teacher-01 Log in | **Đăng nhập** | teacher-03 Attendance |
| teacher-01 Log in | **Quên mật khẩu?** | teacher-02 Forgot password |
| teacher-02 | **Cập nhật mật khẩu** | teacher-03 Attendance |
| teacher-03 Attendance | sidebar **Nhập điểm** | teacher-04 Grades |
| teacher-04 Grades | sidebar **Điểm danh** | teacher-03 Attendance |
| teacher-03 / 04 | **Đăng xuất** | teacher-01 Log in |

---

## Cách khác — nhập bản CHỈNH SỬA ĐƯỢC (nâng cao)

Nếu muốn frame có layer sửa được (không phải ảnh tĩnh): dùng plugin **html.to.design** → *Import from URL* với 3 link (đã live):

```
https://hainam2k5.github.io/Project%20for%20Capstone%202/student_risk_system/Wireframe-Student.html
https://hainam2k5.github.io/Project%20for%20Capstone%202/student_risk_system/Wireframe-Advisor.html
https://hainam2k5.github.io/Project%20for%20Capstone%202/student_risk_system/Wireframe-Teacher.html
```

Nhược điểm: mỗi file nhập thành **1 frame dài** (nhiều màn xếp dọc) → phải tự tách từng `section` thành frame riêng trước khi nối link. Với mục đích prototype bấm-chạy, cách **ảnh-thành-frame** ở trên nhanh và gọn hơn.
