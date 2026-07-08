-- =============================================================================
-- Cấu hình dữ liệu DEMO theo 2 ngành + 2 cố vấn (chạy trong Supabase SQL Editor,
-- SAU schema.sql + seed.sql). An toàn, không xoá gì; chạy lại nhiều lần được.
--
--   Ngành 1: "Hệ thống thông tin quản lý"  → cố vấn advisor@demo.edu.vn
--   Ngành 2: "Tự động hóa và Tin học"      → cố vấn advisor2@demo.edu.vn
--
-- Sau khi chạy, mỗi cố vấn đăng ký bằng đúng email của mình để kích hoạt.
-- =============================================================================

-- Cố vấn ngành 1: dùng lại advisor@demo.edu.vn, đặt ngành
update public.profiles set program = 'Hệ thống thông tin quản lý'
 where email = 'advisor@demo.edu.vn';

-- Cố vấn ngành 2: tạo mới nếu chưa có
insert into public.profiles (role, full_name, email, program)
select 'advisor', 'Cố vấn Tự động hóa & Tin học', 'advisor2@demo.edu.vn', 'Tự động hóa và Tin học'
where not exists (select 1 from public.profiles where email = 'advisor2@demo.edu.vn');
update public.profiles set program = 'Tự động hóa và Tin học'
 where email = 'advisor2@demo.edu.vn';

-- Chia sinh viên mẫu vào 2 ngành + gán đúng cố vấn
update public.profiles set
    program = 'Hệ thống thông tin quản lý',
    advisor_id = (select id from public.profiles where email = 'advisor@demo.edu.vn')
 where role = 'student' and student_code in ('SV001', 'SV002', 'SV003');

update public.profiles set
    program = 'Tự động hóa và Tin học',
    advisor_id = (select id from public.profiles where email = 'advisor2@demo.edu.vn')
 where role = 'student' and student_code in ('SV004', 'SV005', 'SV006');
