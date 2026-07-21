# Student Risk Alert System — Next.js (deploy Vercel)

Phiên bản **Next.js (App Router) + TypeScript** của Hệ thống Cảnh báo Rủi ro Học
tập, dùng backend **Supabase** (Auth + Postgres + Realtime + RLS). Bốn vai trò
**Sinh viên · Giáo viên · Cố vấn · Quản lý**: cổng sinh viên (bảng điểm, GPA/CPA,
cảnh báo, mô phỏng cải thiện điểm, hỏi đáp realtime), trang **Lớp học** (điểm danh +
ghi điểm TX/GK/CK theo lịch 1 buổi/tuần), bảng cố vấn (dashboard phân bố rủi ro,
cảnh báo, can thiệp, đánh giá KPI), **song ngữ VI/EN**.

## Yêu cầu
- **Node.js 18+** (để chạy cục bộ / build).
- Một project **Supabase** (miễn phí).

## 1. Chuẩn bị Supabase (nếu chưa làm)
Trong **Supabase → SQL Editor**, chạy lần lượt các file trong `supabase/`:
1. `schema.sql` — bảng, RLS, trigger đăng ký, realtime (bắt buộc)
2. `rls-major-scope.sql` + `guards.sql` — siết phân quyền theo ngành (khuyến nghị)
3. `teacher-classes.sql` — vai trò Giáo viên + Lớp học (điểm danh & điểm thành phần)
4. `risk-config.sql`, `grade-lock.sql`, `appointments.sql` — cấu hình rủi ro, khóa điểm, lịch hẹn
5. (tùy chọn) `seed-mis-30.sql` — 50 sinh viên mẫu để xem thử dashboard

Rồi **Authentication → Providers → Email** → bật *Confirm email* khi dùng thật.
> Nếu đã chạy `schema.sql` ở bản cũ, chạy thêm `hardening.sql` để cập nhật bản vá
> bảo mật (đăng ký công khai chỉ tạo Sinh viên + siết policy).

## 2. Chạy cục bộ
```bash
cd webapp-next
npm install
cp .env.local.example .env.local     # rồi điền 2 giá trị bên dưới
npm run dev
```
Mở http://localhost:3000

`.env.local` (lấy từ **Supabase → Project Settings → API**):
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...    # anon public key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...        # service_role secret (SERVER ONLY)
```
> `NEXT_PUBLIC_*` là key **anon/public** (an toàn nhờ RLS). `SUPABASE_SERVICE_ROLE_KEY`
> là key **toàn quyền** — chỉ đặt phía server (không có `NEXT_PUBLIC_`), dùng cho
> `/api/admin/import-students` để **tạo tài khoản đăng nhập cho sinh viên**. Trên
> Vercel: **Settings → Environment Variables**. Thiếu key này thì đăng nhập/xem dữ
> liệu vẫn chạy, chỉ **không tạo được tài khoản mới** (báo lỗi rõ).

### Gửi điểm qua email (Gmail SMTP — tùy chọn)
Muốn hệ thống **gửi email** báo điểm cho sinh viên (kèm điểm thành phần). Dùng một
tài khoản Gmail làm SMTP — **không cần tên miền riêng**, gửi tới Gmail sinh viên tốt
(~500 email/ngày):
1. Trên một tài khoản Google (nên tạo riêng, ví dụ `vnuis.risk.alert@gmail.com`):
   bật **Xác minh 2 bước**, rồi **Google Account → Security → App passwords** để tạo
   **mật khẩu ứng dụng 16 ký tự**.
2. Thêm biến môi trường **server** (KHÔNG có `NEXT_PUBLIC_`) — trong `.env.local` khi
   chạy local, và trong **Vercel → Settings → Environment Variables** khi deploy:
   - `GMAIL_USER=vnuis.risk.alert@gmail.com`
   - `GMAIL_APP_PASSWORD=` (16 ký tự, bỏ dấu cách)
   - `NOTIFY_FROM_NAME=Hệ thống Cảnh báo Rủi ro Học tập — VNU-IS` (tùy chọn — chỉ đổi
     tên hiển thị; địa chỉ gửi luôn là `GMAIL_USER`).
> Nếu **không** đặt `GMAIL_USER`/`GMAIL_APP_PASSWORD`, app vẫn chạy bình thường và
> **bỏ qua email** (thông báo trong hệ thống vẫn hiển thị đầy đủ điểm thành phần).
> Cách này chỉ dành cho **email báo điểm**. Email **quên mật khẩu / xác nhận** đi qua
> Supabase Auth — muốn ổn định, đặt cùng Gmail này làm **Custom SMTP** trong
> Supabase → Authentication → SMTP Settings.

### Bảo mật dữ liệu sinh viên
- **RLS** bảo vệ mọi bảng: SV chỉ đọc dữ liệu của mình, không sửa được điểm; khách
  vãng lai không đọc được gì; đăng ký công khai luôn là Sinh viên (trigger ép role).
- **Siết theo ngành (khuyến nghị)**: chạy `supabase/rls-major-scope.sql` trong SQL
  Editor để cố vấn chỉ đọc/ghi được dữ liệu **sinh viên mình phụ trách** ngay ở tầng
  database (mặc định app chỉ lọc ở giao diện). Manager vẫn thấy tất cả.
- **API email** không nhận địa chỉ tùy ý: client gửi `studentId`, server tra email
  qua đúng quyền RLS của cố vấn gọi; nội dung mail được escape HTML.
- **Khi dùng thật (không phải demo)**: bật lại *Confirm email* trong Authentication
  (tránh người lạ đăng ký bằng email SV đã cấp sẵn để chiếm hồ sơ), và đặt
  **Site URL** = link Vercel trong Authentication → URL Configuration.

### Các tính năng bổ sung
- **In bảng điểm**: nút “In bảng điểm” ở cổng SV → hộp thoại in cho **in máy (bản
  cứng)** hoặc **Save as PDF (bản mềm)**.
- **Phân quyền theo ngành**: mỗi cố vấn chỉ thấy/quản lý sinh viên được gán cho mình
  (`advisor_id`); tài khoản `manager` thấy tất cả. Thêm cố vấn khác qua seed/SQL, gán
  SV bằng nút “Thêm sinh viên” trong bảng cố vấn.
- **Nhập liệu Excel/CSV**: nút “Nhập Excel” + “Tải mẫu” (.xlsx) ở trang Sinh viên
  (cột `student_code,full_name,email,program,cohort,attendance_rate,lms_activity_score`),
  và “Nhập điểm (Excel)” để nhập điểm hàng loạt khớp theo mã sinh viên.
- **Trang “Lớp học” (giáo viên & cố vấn)**: chọn lớp → hai tab **Điểm danh** và
  **Ghi điểm** (TX/GK/CK) trong cùng màn; lớp theo lịch 1 buổi/tuần.
- **Dashboard Tổng quan**: **biểu đồ phân bố mức rủi ro** (Thấp/Trung bình/Cao/Nghiêm
  trọng) — bấm một mức để **lọc nhanh** danh sách sinh viên.
- **Mô phỏng cải thiện điểm (cổng SV)**: thử điểm chữ tốt hơn cho môn định học lại →
  CPA & điểm rủi ro tính lại ngay, kèm mục tiêu xếp loại tốt nghiệp (chỉ mô phỏng, không lưu).
- **KPI đánh giá** trên Tổng quan: thời gian xử lý cảnh báo TB, tỷ lệ hoàn thành can
  thiệp, theo dõi ca rủi ro cao, cảnh báo đã xử lý — và **biểu đồ xu hướng rủi ro 14 ngày**.
- **Chi tiết sinh viên (cho giảng viên)**: thẻ thông tin liên hệ (email `mailto:`),
  xem bảng điểm từng SV, và **hộp chat trực tiếp** với sinh viên đó (kèm can thiệp,
  cảnh báo, gửi thông báo).
- **Dự đoán vào vùng báo động** (`lib/predict.ts`, giải thích được — không hộp đen):
  ước tính % khả năng một SV **chưa** báo động sẽ rơi vào vùng báo động, dựa trên
  (1) độ gần ngưỡng của điểm rủi ro & từng chỉ số, và (2) xu hướng điểm rủi ro theo
  lịch sử (chiếu 30 ngày, kèm ETA). Hiện ở cột **“Dự đoán”** trong danh sách SV, thẻ
  dự đoán ở trang chi tiết (kèm lý do + gợi ý can thiệp sớm), và KPI **“Dự đoán sắp
  báo động”** trên Tổng quan.

### Tài khoản
Tài khoản do **nhà trường cấp**: đăng ký công khai luôn là **Sinh viên** (trigger ép
role). Cố vấn/Giáo viên/Quản lý được tạo sẵn hồ sơ (`profiles`) rồi kích hoạt bằng đúng
email tương ứng qua **Supabase → Authentication**. Vai trò lấy từ `profiles.role` — không
suy ra từ email.
> Tài liệu công khai này **không kèm tài khoản/mật khẩu demo** vì lý do bảo mật. Muốn có
> dữ liệu mẫu để xem thử, chạy `supabase/seed-mis-30.sql` (50 sinh viên chỉ-xem, không
> đăng nhập được), rồi tự tạo tài khoản đăng nhập ở Supabase Dashboard nếu cần.

## 3. Deploy lên Vercel
1. Đẩy repo lên GitHub (nếu chưa).
2. Vercel → **Add New… → Project** → import repo.
3. **Root Directory**: chọn
   `Project for Capstone 2/student_risk_system/student_risk_system/webapp-next`
   (vì app nằm trong thư mục con). Framework tự nhận **Next.js**.
4. **Environment Variables**: thêm `NEXT_PUBLIC_SUPABASE_URL` và
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. **Deploy** → nhận link `https://…vercel.app`.

## Cấu trúc
```
app/
  layout.tsx        # bọc I18nProvider, import globals.css
  globals.css       # theme (CSS thuần, không framework UI)
  page.tsx          # đăng nhập / quên mật khẩu (OTP 6 số)
  student/page.tsx  # cổng sinh viên (+ mô phỏng cải thiện điểm)
  teacher/page.tsx  # cổng giáo viên (trang Lớp học)
  advisor/page.tsx  # cố vấn/quản lý (Tổng quan, Sinh viên, Lớp học, Cảnh báo, Tin nhắn, Đánh giá)
  api/              # route đặc quyền: import-students, sync-lms, notify-alert, notify-grade
lib/                # supabaseClient, gpa, risk, predict, i18n, icons, format, types
components/         # common, advisor-parts, classes-view (Lớp học 2 tab), whatif (mô phỏng điểm)
supabase/           # schema.sql + rls-major-scope, guards, teacher-classes, risk-config, ...
```

## Ghi chú kỹ thuật
- **Client-side + RLS**: dữ liệu được bảo vệ bằng Row Level Security; các trang là
  Client Component, guard vai trò bằng `useEffect` + redirect. Không dùng SSR cho
  dữ liệu riêng tư (có thể nâng cấp `@supabase/ssr` + middleware sau).
- **i18n**: đổi VI/EN cập nhật state và re-render ngay (không reload); lưu localStorage.
- **Realtime**: `supabase.channel(...).on('postgres_changes')`, huỷ khi unmount.
- Thang điểm VNU trong `lib/gpa.ts`; engine rủi ro (40/30/15/15) trong `lib/risk.ts`.
