-- =============================================================================
-- Demo data for the Student Risk Alert System.
-- Run AFTER schema.sql, in the Supabase SQL Editor.
--
-- These are profiles WITHOUT a login. To "become" one of them and log in,
-- open the app, go to Register, and sign up using the SAME email
-- (e.g. advisor@demo.edu.vn / sv002@demo.edu.vn). The signup trigger links
-- your new auth account to the seeded profile, inheriting its grades.
--
-- Suggested demo password when you sign up: Demo@12345
-- =============================================================================

-- Idempotent: wipe previous demo rows (safe to re-run) -----------------------
delete from public.profiles where email in (
  'advisor@demo.edu.vn',
  'sv001@demo.edu.vn','sv002@demo.edu.vn','sv003@demo.edu.vn',
  'sv004@demo.edu.vn','sv005@demo.edu.vn','sv006@demo.edu.vn'
);

-- Advisor --------------------------------------------------------------------
insert into public.profiles (id, role, full_name, email) values
  ('11111111-1111-1111-1111-111111111111', 'advisor',
   'TS. Nguyễn Văn Cố Vấn', 'advisor@demo.edu.vn');

-- Students (all assigned to the advisor above) -------------------------------
insert into public.profiles
  (id, role, full_name, email, student_code, program, cohort, advisor_id,
   attendance_rate, lms_activity_score) values
  ('22222222-0000-0000-0000-000000000001','student','Trần Thị Bình','sv001@demo.edu.vn',
   'SV001','Hệ thống thông tin','K68','11111111-1111-1111-1111-111111111111', 96, 88),
  ('22222222-0000-0000-0000-000000000002','student','Lê Văn Cường','sv002@demo.edu.vn',
   'SV002','Hệ thống thông tin','K68','11111111-1111-1111-1111-111111111111', 70, 45),
  ('22222222-0000-0000-0000-000000000003','student','Phạm Thị Dung','sv003@demo.edu.vn',
   'SV003','Khoa học dữ liệu','K69','11111111-1111-1111-1111-111111111111', 86, 68),
  ('22222222-0000-0000-0000-000000000004','student','Hoàng Văn Em','sv004@demo.edu.vn',
   'SV004','Hệ thống thông tin','K69','11111111-1111-1111-1111-111111111111', 54, 28),
  ('22222222-0000-0000-0000-000000000005','student','Vũ Thị Hoa','sv005@demo.edu.vn',
   'SV005','Khoa học dữ liệu','K68','11111111-1111-1111-1111-111111111111', 92, 80),
  ('22222222-0000-0000-0000-000000000006','student','Đỗ Văn Khoa','sv006@demo.edu.vn',
   'SV006','Hệ thống thông tin','K69','11111111-1111-1111-1111-111111111111', 78, 55);

-- Courses --------------------------------------------------------------------
-- Columns: student_id, code, name, credits, semester, weights(TX/GK/CK), scores(TX/GK/CK)
insert into public.courses
  (student_id, code, name, credits, semester, academic_year,
   weight_regular, weight_midterm, weight_final,
   score_regular, score_midterm, score_final) values
  -- SV001 — strong student, two semesters
  ('22222222-0000-0000-0000-000000000001','INT1004','Nhập môn lập trình',3,'2024-2','2024-2025',0.2,0.3,0.5, 9.0,8.5,9.0),
  ('22222222-0000-0000-0000-000000000001','MAT1093','Đại số tuyến tính',3,'2024-2','2024-2025',0.2,0.3,0.5, 8.0,8.0,8.5),
  ('22222222-0000-0000-0000-000000000001','INT2202','Cấu trúc dữ liệu & giải thuật',3,'2025-1','2024-2025',0.2,0.3,0.5, 8.5,9.0,8.5),
  ('22222222-0000-0000-0000-000000000001','INS2020','Cơ sở dữ liệu',3,'2025-1','2024-2025',0.2,0.3,0.5, 8.0,8.5,9.0),
  -- SV002 — at risk, one fail
  ('22222222-0000-0000-0000-000000000002','INT1004','Nhập môn lập trình',3,'2024-2','2024-2025',0.2,0.3,0.5, 5.0,4.5,5.5),
  ('22222222-0000-0000-0000-000000000002','MAT1093','Đại số tuyến tính',3,'2024-2','2024-2025',0.2,0.3,0.5, 4.0,3.5,3.0),
  ('22222222-0000-0000-0000-000000000002','INT2202','Cấu trúc dữ liệu & giải thuật',3,'2025-1','2024-2025',0.2,0.3,0.5, 5.5,5.0,4.5),
  ('22222222-0000-0000-0000-000000000002','INS2020','Cơ sở dữ liệu',3,'2025-1','2024-2025',0.2,0.3,0.5, 6.0,5.5,6.0),
  -- SV003 — medium
  ('22222222-0000-0000-0000-000000000003','INT2202','Cấu trúc dữ liệu & giải thuật',3,'2025-1','2024-2025',0.2,0.3,0.5, 6.5,6.0,7.0),
  ('22222222-0000-0000-0000-000000000003','INS2020','Cơ sở dữ liệu',3,'2025-1','2024-2025',0.2,0.3,0.5, 7.0,6.5,6.5),
  ('22222222-0000-0000-0000-000000000003','MAT1101','Giải tích 1',4,'2025-1','2024-2025',0.2,0.3,0.5, 6.0,5.5,6.0),
  -- SV004 — critical, multiple fails
  ('22222222-0000-0000-0000-000000000004','INT1004','Nhập môn lập trình',3,'2025-1','2024-2025',0.2,0.3,0.5, 3.0,2.5,3.0),
  ('22222222-0000-0000-0000-000000000004','MAT1093','Đại số tuyến tính',3,'2025-1','2024-2025',0.2,0.3,0.5, 2.0,3.0,2.5),
  ('22222222-0000-0000-0000-000000000004','MAT1101','Giải tích 1',4,'2025-1','2024-2025',0.2,0.3,0.5, 4.0,3.5,4.0),
  ('22222222-0000-0000-0000-000000000004','INS1004','Nhập môn HTTT',3,'2025-1','2024-2025',0.2,0.3,0.5, 5.0,4.0,4.5),
  -- SV005 — strong
  ('22222222-0000-0000-0000-000000000005','INT2202','Cấu trúc dữ liệu & giải thuật',3,'2025-1','2024-2025',0.2,0.3,0.5, 8.0,7.5,8.5),
  ('22222222-0000-0000-0000-000000000005','INS2020','Cơ sở dữ liệu',3,'2025-1','2024-2025',0.2,0.3,0.5, 7.5,8.0,8.0),
  ('22222222-0000-0000-0000-000000000005','MAT1101','Giải tích 1',4,'2025-1','2024-2025',0.2,0.3,0.5, 8.0,8.5,8.0),
  -- SV006 — medium, one component still ungraded (final missing)
  ('22222222-0000-0000-0000-000000000006','INT1004','Nhập môn lập trình',3,'2025-1','2024-2025',0.2,0.3,0.5, 6.0,5.5,6.0),
  ('22222222-0000-0000-0000-000000000006','INS2020','Cơ sở dữ liệu',3,'2025-1','2024-2025',0.2,0.3,0.5, 5.5,5.0,5.5),
  ('22222222-0000-0000-0000-000000000006','MAT1101','Giải tích 1',4,'2025-1','2024-2025',0.2,0.3,0.5, 6.5,6.0,null);

-- Compute total_score / letter_grade / grade_point (VNU scale) ---------------
-- Only courses that have all three components are finalised.
update public.courses set total_score = round(
    (coalesce(score_regular,0)*weight_regular
   + coalesce(score_midterm,0)*weight_midterm
   + coalesce(score_final,0)*weight_final)::numeric, 2)
 where score_regular is not null and score_midterm is not null and score_final is not null;

update public.courses set
  grade_point = case
    when total_score >= 8.5 then 4.0 when total_score >= 8.0 then 3.5
    when total_score >= 7.0 then 3.0 when total_score >= 6.5 then 2.5
    when total_score >= 5.5 then 2.0 when total_score >= 5.0 then 1.5
    when total_score >= 4.0 then 1.0 else 0 end,
  letter_grade = case
    when total_score >= 8.5 then 'A'  when total_score >= 8.0 then 'B+'
    when total_score >= 7.0 then 'B'  when total_score >= 6.5 then 'C+'
    when total_score >= 5.5 then 'C'  when total_score >= 5.0 then 'D+'
    when total_score >= 4.0 then 'D'  else 'F' end
 where total_score is not null;

-- A welcome notification + a sample question so the demo isn't empty ----------
insert into public.notifications (student_id, sender_id, title, body, type) values
  ('22222222-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',
   'Chào mừng đến hệ thống', 'Em có thể xem điểm và trao đổi trực tiếp với cố vấn tại đây.', 'system');

insert into public.messages (student_id, advisor_id, sender_id, sender_role, body) values
  ('22222222-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',
   '22222222-0000-0000-0000-000000000002','student',
   'Thầy ơi, em muốn hỏi về kết quả môn Đại số tuyến tính ạ.');

-- Done. Risk scores & alerts are generated automatically the first time the
-- advisor opens the console (or via the "Tính lại rủi ro" button).
