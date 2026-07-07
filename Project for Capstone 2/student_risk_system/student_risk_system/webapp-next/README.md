# Student Risk Alert System — Next.js (deploy Vercel)

Phiên bản **Next.js (App Router) + TypeScript** của Hệ thống Cảnh báo Rủi ro Học
tập, dùng chung backend **Supabase** (Auth + Postgres + Realtime + RLS) với bản
web tĩnh ở thư mục `../webapp`. Giữ nguyên tính năng: đăng nhập/đăng ký, cổng sinh
viên, bảng cố vấn (nhập điểm TX/GK/CK, GPA/CPA, rủi ro, cảnh báo, can thiệp, thông
báo, hỏi đáp realtime), **song ngữ VI/EN**.

## Yêu cầu
- **Node.js 18+** (để chạy cục bộ / build).
- Một project **Supabase** (miễn phí).

## 1. Chuẩn bị Supabase (nếu chưa làm)
Trong **Supabase → SQL Editor**, chạy lần lượt:
1. `supabase/schema.sql` (bảng + RLS + trigger + realtime)
2. `supabase/seed.sql` (dữ liệu demo)

Rồi **Authentication → Providers → Email** → tắt *Confirm email* để demo mượt.
> Nếu bạn đã chạy `schema.sql` ở bản cũ, chạy thêm `supabase/hardening.sql` để cập
> nhật bản vá bảo mật (đăng ký công khai chỉ tạo Sinh viên + siết policy).

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
```
> Chỉ dùng key **anon/public** (an toàn nhờ RLS). Không đưa `service_role` vào đây.

### Gửi điểm qua email (Resend — tùy chọn)
Muốn hệ thống **gửi email** báo điểm cho sinh viên (kèm điểm thành phần):
1. Tạo tài khoản https://resend.com → **API Keys** → tạo key `re_...`.
2. Thêm biến môi trường **server** (KHÔNG có `NEXT_PUBLIC_`) — trong `.env.local`
   khi chạy local, và trong **Vercel → Settings → Environment Variables** khi deploy:
   - `RESEND_API_KEY=re_...`
   - `NOTIFY_FROM=Academic Risk Alert <onboarding@resend.dev>` (test) hoặc địa chỉ
     thuộc **tên miền đã xác thực** trên Resend.
> Địa chỉ test `onboarding@resend.dev` chỉ gửi tới đúng email tài khoản Resend của
> bạn. Muốn gửi tới email SV bất kỳ → xác thực tên miền trong Resend.
> Nếu **không** đặt `RESEND_API_KEY`, app vẫn chạy bình thường và **bỏ qua email**
> (thông báo trong hệ thống vẫn hiển thị đầy đủ điểm thành phần).

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
- **Nhập liệu CSV**: nút “Nhập CSV” + “Tải mẫu” ở trang Sinh viên (cột
  `student_code,full_name,email,program,cohort,attendance_rate,lms_activity_score`).
- **KPI đánh giá** trên Tổng quan: thời gian xử lý cảnh báo TB, tỷ lệ hoàn thành can
  thiệp, theo dõi ca rủi ro cao, cảnh báo đã xử lý — và **biểu đồ xu hướng rủi ro 14 ngày**.
- **Chi tiết sinh viên (cho giảng viên)**: thẻ thông tin liên hệ (email `mailto:`),
  xem bảng điểm từng SV, và **hộp chat trực tiếp** với sinh viên đó (kèm can thiệp,
  cảnh báo, gửi thông báo).

### Tài khoản demo
Đăng ký (tab **Đăng ký**) bằng đúng email để nhận dữ liệu mẫu (mật khẩu `Demo@12345`):
- Cố vấn: `advisor@demo.edu.vn` · Sinh viên rủi ro: `sv002@demo.edu.vn` / `sv004@demo.edu.vn`

(Đăng ký công khai luôn là **Sinh viên**; tài khoản cố vấn nhận vai trò từ hồ sơ đã
seed khi đăng ký bằng đúng email cố vấn.)

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
  globals.css       # theme (giống bản tĩnh)
  page.tsx          # đăng nhập / đăng ký
  student/page.tsx  # cổng sinh viên
  advisor/page.tsx  # bảng cố vấn (6 màn hình, đổi bằng state)
lib/                # supabaseClient, gpa, risk, i18n, icons, format, types
components/         # common (LangSwitch, RiskBadge, RiskBar), advisor-parts (form con)
supabase/           # schema.sql, seed.sql, hardening.sql (giống ../webapp)
```

## Ghi chú kỹ thuật
- **Client-side + RLS**: dữ liệu được bảo vệ bằng Row Level Security; các trang là
  Client Component, guard vai trò bằng `useEffect` + redirect. Không dùng SSR cho
  dữ liệu riêng tư (có thể nâng cấp `@supabase/ssr` + middleware sau).
- **i18n**: đổi VI/EN cập nhật state và re-render ngay (không reload); lưu localStorage.
- **Realtime**: `supabase.channel(...).on('postgres_changes')`, huỷ khi unmount.
- Thang điểm VNU trong `lib/gpa.ts`; engine rủi ro (40/30/15/15) trong `lib/risk.ts`.
