export type Role = "student" | "advisor" | "manager";

export interface Profile {
  id: string;
  user_id: string | null;
  role: Role;
  full_name: string;
  email: string | null;
  student_code: string | null;
  program: string;
  cohort: string;
  advisor_id: string | null;
  attendance_rate: number;
  lms_activity_score: number;
  created_at?: string;
}

export interface Course {
  id: string;
  student_id: string;
  code: string;
  name: string;
  credits: number;
  semester: string;
  academic_year: string;
  weight_regular: number;
  weight_midterm: number;
  weight_final: number;
  score_regular: number | null;
  score_midterm: number | null;
  score_final: number | null;
  total_score: number | null;
  letter_grade: string | null;
  grade_point: number | null;
  locked?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Appointment {
  id: string;
  student_id: string;
  advisor_id: string | null;
  starts_at: string;
  note: string;
  status: "requested" | "confirmed" | "cancelled" | "done";
  created_at?: string;
}

export type RiskLevel = "Low" | "Medium" | "High" | "Critical";

export interface RiskScore {
  id: string;
  student_id: string;
  score: number;
  risk_level: RiskLevel;
  factor_gpa: number;
  factor_attendance: number;
  factor_lms: number;
  factor_failed_credits: number;
  computed_at: string;
}

export type AlertStatus = "Open" | "Acknowledged" | "Resolved" | "Dismissed";

export interface Alert {
  id: string;
  student_id: string;
  advisor_id: string | null;
  risk_level: string;
  score_at_alert: number;
  status: AlertStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface Intervention {
  id: string;
  alert_id: string;
  advisor_id: string | null;
  action_type: string;
  notes: string;
  status: "Planned" | "Completed" | "Follow-up needed";
  outcome: string;
  created_at: string;
}

export interface Notification {
  id: string;
  student_id: string;
  sender_id: string | null;
  title: string;
  body: string;
  type: "grade" | "alert" | "message" | "system";
  is_read: boolean;
  created_at: string;
}

export interface Message {
  id: string;
  student_id: string;
  advisor_id: string | null;
  sender_id: string | null;
  sender_role: string;
  body: string;
  is_read: boolean;
  created_at: string;
}
