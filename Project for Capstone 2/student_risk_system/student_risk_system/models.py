"""
Database models for the Student Risk Alert System (Academic DSS).

Tables
------
Advisor        - academic advisors / programme staff who use the system
Student        - student academic profile
RiskScore      - one row per computed risk snapshot for a student (history)
Alert          - generated when a student crosses a risk threshold
Intervention   - case-management record logged against an alert
"""
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


class Advisor(db.Model):
    __tablename__ = "advisors"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(160), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(30), default="advisor")  # advisor | manager

    alerts = db.relationship("Alert", back_populates="advisor")
    interventions = db.relationship("Intervention", back_populates="advisor")

    def set_password(self, raw_password):
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password):
        return check_password_hash(self.password_hash, raw_password)


class Student(db.Model):
    __tablename__ = "students"

    id = db.Column(db.Integer, primary_key=True)
    student_code = db.Column(db.String(30), unique=True, nullable=False)
    name = db.Column(db.String(120), nullable=False)
    program = db.Column(db.String(120), default="")
    cohort = db.Column(db.String(30), default="")

    # Raw indicators used by the risk engine
    gpa = db.Column(db.Float, default=0.0)                 # 0.0 - 4.0
    attendance_rate = db.Column(db.Float, default=100.0)    # 0 - 100 (%)
    lms_activity_score = db.Column(db.Float, default=100.0) # 0 - 100 (engagement index)
    credits_failed = db.Column(db.Integer, default=0)       # count of failed courses (current term)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    risk_scores = db.relationship(
        "RiskScore", back_populates="student", cascade="all, delete-orphan",
        order_by="RiskScore.computed_at.desc()"
    )
    alerts = db.relationship(
        "Alert", back_populates="student", cascade="all, delete-orphan",
        order_by="Alert.created_at.desc()"
    )

    @property
    def latest_risk(self):
        return self.risk_scores[0] if self.risk_scores else None


class RiskScore(db.Model):
    __tablename__ = "risk_scores"

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey("students.id"), nullable=False)

    score = db.Column(db.Float, nullable=False)          # 0 - 100 composite risk score
    risk_level = db.Column(db.String(20), nullable=False)  # Low | Medium | High | Critical

    # Explainable factor breakdown, stored as individual contribution points (0-100 each factor's contribution to score)
    factor_gpa = db.Column(db.Float, default=0.0)
    factor_attendance = db.Column(db.Float, default=0.0)
    factor_lms = db.Column(db.Float, default=0.0)
    factor_failed_credits = db.Column(db.Float, default=0.0)

    computed_at = db.Column(db.DateTime, default=datetime.utcnow)

    student = db.relationship("Student", back_populates="risk_scores")

    def factor_breakdown(self):
        return [
            {"label": "GPA", "value": round(self.factor_gpa, 1)},
            {"label": "Attendance", "value": round(self.factor_attendance, 1)},
            {"label": "LMS activity", "value": round(self.factor_lms, 1)},
            {"label": "Failed credits", "value": round(self.factor_failed_credits, 1)},
        ]


class Alert(db.Model):
    __tablename__ = "alerts"

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey("students.id"), nullable=False)
    advisor_id = db.Column(db.Integer, db.ForeignKey("advisors.id"), nullable=True)

    risk_level = db.Column(db.String(20), nullable=False)
    score_at_alert = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(20), default="Open")  # Open | Acknowledged | Resolved | Dismissed

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    resolved_at = db.Column(db.DateTime, nullable=True)

    student = db.relationship("Student", back_populates="alerts")
    advisor = db.relationship("Advisor", back_populates="alerts")
    interventions = db.relationship(
        "Intervention", back_populates="alert", cascade="all, delete-orphan",
        order_by="Intervention.created_at.desc()"
    )


class Intervention(db.Model):
    __tablename__ = "interventions"

    id = db.Column(db.Integer, primary_key=True)
    alert_id = db.Column(db.Integer, db.ForeignKey("alerts.id"), nullable=False)
    advisor_id = db.Column(db.Integer, db.ForeignKey("advisors.id"), nullable=False)

    action_type = db.Column(db.String(60), default="Advising meeting")
    notes = db.Column(db.Text, default="")
    status = db.Column(db.String(20), default="Planned")  # Planned | Completed | Follow-up needed
    outcome = db.Column(db.Text, default="")

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    alert = db.relationship("Alert", back_populates="interventions")
    advisor = db.relationship("Advisor", back_populates="interventions")
