# Hệ thống Cảnh báo Rủi ro Học tập — Web + Supabase

Phiên bản web chạy trên **cloud** (Supabase: Auth + Postgres + Realtime + RLS),
dữ liệu **không mất** khi đóng/mở lại, cập nhật **realtime**, hai vai trò
**Cố vấn** và **Sinh viên**, nhập điểm theo thành phần (TX/GK/CK) và tự tính
**GPA (học kỳ) / CPA (tích lũy)** theo thang điểm VNU.

**Song ngữ Việt / Anh:** nút chuyển **VI / EN** nằm ở góc trên trang đăng nhập và
trên thanh tiêu đề sau khi đăng nhập; lựa chọn được ghi nhớ cho lần sau. Muốn sửa
hoặc bổ sung bản dịch, chỉnh từ điển trong `assets/js/i18n.js`.

> Đây là bản nâng cấp của prototype Flask + SQLite (thư mục cha) — giữ prototype
> đó làm "phiên bản v1" cho báo cáo.

## 0. Yêu cầu
- Một tài khoản Supabase miễn phí (https://supabase.com).
- Không cần cài đặt gì để chạy: chỉ là HTML/CSS/JS tĩnh.

## 1. Tạo project Supabase & cơ sở dữ liệu
1. Vào https://supabase.com → **New project** (đặt tên, mật khẩu DB, chọn region gần).
2. Mở **SQL Editor** → **New query** → dán toàn bộ `supabase/schema.sql` → **Run**.
3. Tạo query mới → dán `supabase/seed.sql` → **Run** (tạo dữ liệu demo).
4. **Tắt xác nhận email** để demo mượt: **Authentication → Providers → Email**
   → tắt *Confirm email* (hoặc **Authentication → Settings** tùy phiên bản).
   (Nếu để bật, sau khi đăng ký phải bấm link trong email rồi mới đăng nhập.)

Realtime đã được bật sẵn cho các bảng trong `schema.sql`.

## 2. Cấu hình khóa kết nối
Mở **Project Settings → API**, sao chép:
- **Project URL**
- **anon public** key

Dán vào `assets/js/config.js`:
```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",   // anon public key
};
```
> `anon` key công khai là **an toàn** — mọi bảng đã được bảo vệ bằng RLS.
> **Tuyệt đối không** dán `service_role` key vào frontend.

## 3. Chạy thử
### Cục bộ
```bash
cd webapp
python -m http.server 5173
```
Mở http://localhost:5173

### Tài khoản demo
Đăng ký (tab **Đăng ký**) bằng **đúng email** dưới đây để nhận sẵn dữ liệu mẫu
(trigger sẽ gắn tài khoản vào hồ sơ đã seed):

| Vai trò | Email | Mật khẩu gợi ý |
|---|---|---|
| Cố vấn | `advisor@demo.edu.vn` | `Demo@12345` |
| Sinh viên (rủi ro) | `sv002@demo.edu.vn` | `Demo@12345` |
| Sinh viên (nghiêm trọng) | `sv004@demo.edu.vn` | `Demo@12345` |
| Sinh viên (tốt) | `sv001@demo.edu.vn` | `Demo@12345` |

> Khi đăng ký cố vấn, chọn vai trò **Cố vấn**; khi đăng ký sinh viên chọn **Sinh viên**.
> Vai trò thực tế của các email demo đã được cố định trong seed nên vẫn đúng.

## 4. Kịch bản demo (thể hiện đủ yêu cầu đề tài)
1. Đăng nhập **cố vấn** → Tổng quan tự chấm rủi ro, hiện SV rủi ro cao + cảnh báo.
2. Mở một sinh viên → **nhập/sửa điểm** TX/GK/CK: hệ thống tự tính điểm tổng,
   điểm chữ, GPA/CPA, chấm lại rủi ro; nếu vào mức báo động → tạo **cảnh báo** +
   **thông báo** tự động cho sinh viên.
3. Mở tab ẩn danh, đăng nhập **sinh viên** đó → thấy điểm + thông báo **realtime**
   (không cần F5); gửi câu hỏi cho cố vấn.
4. Quay lại cố vấn → tab **Tin nhắn** nhận realtime, trả lời → sinh viên thấy ngay.
5. Ghi **can thiệp**, đổi **trạng thái cảnh báo**, gửi **thông báo** thủ công.
6. Đóng trình duyệt, mở lại → dữ liệu vẫn còn (lưu trên Postgres).

## 5. Triển khai lên cloud (chọn 1)
- **Netlify / Vercel**: kéo–thả thư mục `webapp/` (hoặc kết nối GitHub) → có link https.
- **GitHub Pages**: đưa `webapp/` lên repo, bật Pages trỏ vào thư mục đó.

Vì là web tĩnh + Supabase, không cần server backend.

## Thang điểm (VNU) — chỉnh trong `assets/js/gpa.js`
`A ≥8.5 = 4.0 · B+ ≥8.0 = 3.5 · B ≥7.0 = 3.0 · C+ ≥6.5 = 2.5 · C ≥5.5 = 2.0 ·
D+ ≥5.0 = 1.5 · D ≥4.0 = 1.0 · F <4.0 = 0`. Điểm tổng môn = TX·wTX + GK·wGK + CK·wCK
(trọng số cấu hình riêng từng môn). GPA/CPA = Σ(điểm hệ 4 × tín chỉ) / Σ tín chỉ.

## Mô hình rủi ro (giải thích được) — `assets/js/risk.js`
Trọng số: CPA 40% · Điểm danh 30% · LMS 15% · Môn trượt 15% → điểm 0–100 →
Thấp/Trung bình/Cao/Nghiêm trọng. Từ **Trung bình** trở lên sẽ sinh cảnh báo.

## Ngoài phạm vi
- Chưa gửi email/SMS thật (thông báo hiện trong app — "optional extension" của đề bài).
- Đăng ký chọn vai trò chỉ để demo; thực tế cố vấn/quản trị cấp tài khoản sinh viên.
