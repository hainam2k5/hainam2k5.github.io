# Sơ đồ hệ thống — Cảnh báo Rủi ro Học tập (Student Alert System · VNU-IS)

Bộ 5 sơ đồ vẽ bằng **Mermaid** (render tự động trên GitHub, VS Code, mermaid.live). Bám sát schema thật (11 bảng Postgres/Supabase) và các luồng nghiệp vụ của ứng dụng.

- Trọng số rủi ro: **GPA 0.4 · Chuyên cần 0.3 · LMS 0.15 · Môn F 0.15**; ngưỡng mức: **40 / 65 / 85** (Trung bình / Cao / Nguy cấp).
- Điểm thành phần: **TX 0.2 · GK 0.3 · CK 0.5**.

---

## 1. ERD — Sơ đồ quan hệ thực thể (Cơ sở dữ liệu)

```mermaid
erDiagram
  profiles ||--o{ profiles : "cố vấn của"
  profiles ||--o{ courses : "học"
  profiles ||--o{ sections : "giảng dạy"
  profiles ||--o{ attendance : "điểm danh"
  sections ||--o{ attendance : "gồm buổi"
  profiles ||--o{ risk_scores : "được chấm"
  profiles ||--o{ alerts : "liên quan"
  alerts ||--o{ interventions : "dẫn tới"
  profiles ||--o{ interventions : "thực hiện"
  profiles ||--o{ appointments : "đặt / duyệt"
  profiles ||--o{ notifications : "nhận"
  profiles ||--o{ messages : "trao đổi"

  profiles {
    uuid id PK
    uuid user_id
    text role
    text full_name
    text email
    text student_code
    text program
    text cohort
    uuid advisor_id FK
    numeric attendance_rate
    numeric lms_activity_score
  }
  courses {
    uuid id PK
    uuid student_id FK
    text code
    text name
    int credits
    text semester
    text academic_year
    numeric score_regular
    numeric score_midterm
    numeric score_final
    numeric total_score
    text letter_grade
    numeric grade_point
    bool locked
  }
  sections {
    uuid id PK
    text code
    text name
    text semester
    text academic_year
    uuid teacher_id FK
    int credits
    numeric weight_regular
    numeric weight_midterm
    numeric weight_final
  }
  attendance {
    uuid id PK
    uuid section_id FK
    uuid student_id FK
    date session_date
    bool present
  }
  risk_scores {
    uuid id PK
    uuid student_id FK
    numeric score
    text risk_level
    numeric factor_gpa
    numeric factor_attendance
    numeric factor_lms
    numeric factor_failed_credits
    timestamptz computed_at
  }
  alerts {
    uuid id PK
    uuid student_id FK
    uuid advisor_id FK
    text risk_level
    numeric score_at_alert
    text status
    timestamptz created_at
    timestamptz resolved_at
  }
  interventions {
    uuid id PK
    uuid alert_id FK
    uuid advisor_id FK
    text action_type
    text notes
    text status
    text outcome
    timestamptz created_at
  }
  appointments {
    uuid id PK
    uuid student_id FK
    uuid advisor_id FK
    timestamptz starts_at
    text note
    text status
    timestamptz created_at
  }
  notifications {
    uuid id PK
    uuid student_id FK
    uuid sender_id FK
    text title
    text body
    text type
    bool is_read
    timestamptz created_at
  }
  messages {
    uuid id PK
    uuid student_id FK
    uuid advisor_id FK
    uuid sender_id FK
    text sender_role
    text body
    bool is_read
    timestamptz created_at
  }
  risk_config {
    int id PK
    numeric w_gpa
    numeric w_att
    numeric w_lms
    numeric w_fail
    int th_medium
    int th_high
    int th_critical
  }
```

> `profiles` là bảng trung tâm cho cả 4 vai trò (student / teacher / advisor / manager); `advisor_id` là khóa ngoại tự tham chiếu (cố vấn ↔ sinh viên). `risk_config` là bảng cấu hình đơn (một dòng, id = 1).

---

## 2. Flowchart — Thuật toán chấm rủi ro & phát cảnh báo

```mermaid
flowchart TD
  A([Có dữ liệu mới: điểm / chuyên cần / LMS]) --> B[Thu thập GPA, tỷ lệ chuyên cần, điểm LMS, số môn F]
  B --> C[Tính điểm rủi ro có trọng số<br/>GPA 0.4 · Chuyên cần 0.3 · LMS 0.15 · Môn F 0.15]
  C --> D{Điểm rủi ro}
  D -->|nhỏ hơn 40| E[Mức: Thấp]
  D -->|40 đến 64| F[Mức: Trung bình]
  D -->|65 đến 84| G[Mức: Cao]
  D -->|từ 85 trở lên| H[Mức: Nguy cấp]
  E --> Z([Cập nhật bảng điều khiển cố vấn])
  F --> I{Đạt điều kiện cảnh báo<br/>hoặc quy tắc tổ hợp?}
  G --> I
  H --> I
  I -->|Không| Z
  I -->|Có| J[Tự mở cảnh báo cho cố vấn]
  J --> K[Gửi thông báo và email cho sinh viên]
  K --> Z
```

> Quy tắc tổ hợp (early signals): GPA tụt mạnh giữa 2 kỳ, trượt ≥ 2 môn, chuyên cần < 75%, hoặc LMS < 40 — có thể phát cảnh báo ngay cả khi điểm tổng chưa cao.

---

## 3. Activity diagram có Swimlane — Quy trình end-to-end theo vai trò

```mermaid
flowchart TB
  subgraph GV[Giáo viên]
    direction TB
    G1[Nhập điểm thành phần TX / GK / CK]
    G2[Điểm danh theo buổi]
  end
  subgraph HT[Hệ thống]
    direction TB
    H1[Tính tổng, điểm chữ, GPA và CPA]
    H2[Tính điểm rủi ro và phân mức]
    H3{Đạt ngưỡng cảnh báo?}
    H4[Tạo cảnh báo, gửi email và thông báo]
    HX([Kết thúc chu trình])
    H1 --> H2 --> H3
    H3 -->|Có| H4
    H3 -->|Không| HX
  end
  subgraph CV[Cố vấn]
    direction TB
    C1[Xem danh sách sinh viên rủi ro]
    C2[Ghi nhận can thiệp]
    C3[Theo dõi rủi ro trước và sau]
    C1 --> C2 --> C3
  end
  subgraph SV[Sinh viên]
    direction TB
    S1[Nhận cảnh báo và xem điểm]
    S2[Đặt lịch hẹn cố vấn]
    S1 --> S2
  end
  G1 --> H1
  G2 --> H1
  H4 --> C1
  H4 --> S1
  S2 --> C1
  C3 --> HX
```

> Bốn làn (lane): **Giáo viên → Hệ thống → Cố vấn / Sinh viên**. Mermaid dùng `subgraph` để mô phỏng swimlane; mũi tên bắc cầu giữa các làn thể hiện dòng công việc.

---

## 4. Use Case diagram — Tác nhân & chức năng

```mermaid
flowchart LR
  student([Sinh viên])
  teacher([Giáo viên])
  advisor([Cố vấn])
  manager([Quản lý])

  subgraph SYS[Hệ thống Cảnh báo Rủi ro Học tập]
    u1(Đăng nhập và quên mật khẩu)
    u2(Xem điểm và cảnh báo)
    u3(Đặt lịch hẹn cố vấn)
    u4(Hỏi đáp với cố vấn)
    u5(Nhập điểm thành phần)
    u6(Điểm danh theo buổi)
    u7(Xem và lọc sinh viên rủi ro)
    u8(Xử lý cảnh báo và ghi can thiệp)
    u9(Gửi thông báo và email)
    u10(Nhập điểm hàng loạt từ CSV)
    u11(Đồng bộ SIS / LMS)
    u12(Cấu hình trọng số và ngưỡng)
    u13(Đánh giá mô hình P/R/F1)
  end

  student --- u2
  student --- u3
  student --- u4
  teacher --- u5
  teacher --- u6
  advisor --- u7
  advisor --- u8
  advisor --- u10
  advisor --- u3
  manager --- u11
  manager --- u12
  manager --- u13
  u8 -. include .-> u9
  u2 -. include .-> u1
  u7 -. include .-> u1
```

> Mermaid không có ký hiệu Use Case UML gốc (người que + hình bầu dục), nên đây là bản mô phỏng bằng flowchart. Muốn bản UML chuẩn: dán logic này vào **PlantUML** hoặc **draw.io**.

---

## 5. BPMN — Quy trình cảnh báo & can thiệp (pool / lane, gateway, sự kiện)

```mermaid
flowchart LR
  start((Bắt đầu)):::startev
  subgraph GV[Lane: Giáo viên]
    t1[Nhập điểm và điểm danh]
  end
  subgraph HT[Lane: Hệ thống]
    t2[Tính GPA/CPA và điểm rủi ro]
    g1{Đạt ngưỡng<br/>cảnh báo?}
    t3[Tạo cảnh báo và gửi email/thông báo]
    t2 --> g1
    g1 -->|Có| t3
  end
  subgraph CV[Lane: Cố vấn]
    t4[Tiếp nhận và xem cảnh báo]
    t5[Ghi nhận can thiệp]
    g2{Rủi ro đã giảm?}
    t6[Đóng cảnh báo]
    t7[Lên kế hoạch theo dõi tiếp]
    t4 --> t5 --> g2
    g2 -->|Có| t6
    g2 -->|Chưa| t7
  end
  start --> t1
  t1 --> t2
  g1 -->|Không| e1((Kết thúc<br/>theo dõi)):::endev
  t3 --> t4
  t6 --> e2((Kết thúc<br/>đã xử lý)):::endev
  t7 --> t5

  classDef startev fill:#e8f0ff,stroke:#2461e6,stroke-width:1.5px;
  classDef endev fill:#fdecec,stroke:#c0392b,stroke-width:3px;
```

> BPMN-style dựng bằng Mermaid: **pool/lane** = `subgraph`, **gateway** = hình thoi, **sự kiện đầu/cuối** = hình tròn (viền mảnh = start, viền đậm = end). Muốn file **BPMN 2.0 chuẩn** (mở bằng Camunda/Signavio): tái dựng luồng này trong **bpmn.io** hoặc **draw.io** (đều có mẫu BPMN).
