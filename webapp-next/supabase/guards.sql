-- =============================================================================
-- RÀO CHẮN dữ liệu (chạy 1 lần trong Supabase SQL Editor; chạy lại được).
-- Yêu cầu: đã chạy rls-major-scope.sql trước đó (cần hàm is_my_student).
--
-- 1) Cấm 2 hồ sơ trùng email  → khi đăng ký, handle_new_user luôn nối đúng
--    hồ sơ có sẵn thay vì chọn ngẫu nhiên giữa các bản trùng.
-- 2) Cấm 2 cố vấn cùng ngành  → trigger auto-assign advisor luôn cho kết quả
--    xác định (hết cảnh sinh viên bị gán vào cố vấn demo cùng tên ngành).
-- 3) Khẳng định lại profiles_select bản CHẶT — phòng trường hợp hardening.sql
--    được chạy SAU rls-major-scope.sql và âm thầm đè mất giới hạn theo ngành.
-- =============================================================================

create unique index if not exists profiles_email_uniq
  on public.profiles (lower(email))
  where email is not null and email <> '';

create unique index if not exists profiles_one_advisor_per_program
  on public.profiles (lower(program))
  where role = 'advisor' and coalesce(program, '') <> '';

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  user_id = auth.uid()
  or (auth.uid() is not null and role in ('advisor','manager'))  -- advisor cards
  or (role = 'student' and is_my_student(id))
);
