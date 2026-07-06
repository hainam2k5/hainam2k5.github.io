"""
Rule-based, explainable risk scoring engine.

The score is a weighted composite of four indicators. Each indicator is
normalised to a 0-100 "risk contribution" (higher = worse), then combined
with fixed weights. Weights and thresholds are intentionally simple and
transparent so advisors can see exactly why a student was flagged
(explainable AI requirement from the capstone brief), rather than a black
box model.
"""

WEIGHTS = {
    "gpa": 0.40,
    "attendance": 0.30,
    "lms": 0.15,
    "failed_credits": 0.15,
}

THRESHOLDS = [
    (85, "Critical"),
    (65, "High"),
    (40, "Medium"),
    (0, "Low"),
]


def _gpa_risk(gpa: float) -> float:
    """GPA below 2.0 (on a 4.0 scale) is treated as maximum risk."""
    gpa = max(0.0, min(4.0, gpa or 0.0))
    return max(0.0, min(100.0, (2.5 - gpa) / 2.5 * 100))


def _attendance_risk(attendance_rate: float) -> float:
    """Attendance below 70% is treated as maximum risk."""
    rate = max(0.0, min(100.0, attendance_rate or 0.0))
    return max(0.0, min(100.0, (85 - rate) / 85 * 100))


def _lms_risk(lms_activity_score: float) -> float:
    """LMS engagement index below 40 is treated as maximum risk."""
    activity = max(0.0, min(100.0, lms_activity_score or 0.0))
    return max(0.0, min(100.0, (60 - activity) / 60 * 100))


def _failed_credits_risk(credits_failed: int) -> float:
    """Each failed course this term adds risk, capped at 3+ courses."""
    n = max(0, credits_failed or 0)
    return min(100.0, n * 34.0)


def compute_risk(student) -> dict:
    """Return a dict with composite score, level, and per-factor contributions."""
    gpa_r = _gpa_risk(student.gpa)
    att_r = _attendance_risk(student.attendance_rate)
    lms_r = _lms_risk(student.lms_activity_score)
    fail_r = _failed_credits_risk(student.credits_failed)

    factor_gpa = gpa_r * WEIGHTS["gpa"]
    factor_attendance = att_r * WEIGHTS["attendance"]
    factor_lms = lms_r * WEIGHTS["lms"]
    factor_failed = fail_r * WEIGHTS["failed_credits"]

    score = factor_gpa + factor_attendance + factor_lms + factor_failed
    score = round(min(100.0, max(0.0, score)), 1)

    level = "Low"
    for threshold, label in THRESHOLDS:
        if score >= threshold:
            level = label
            break

    return {
        "score": score,
        "level": level,
        "factor_gpa": round(factor_gpa, 1),
        "factor_attendance": round(factor_attendance, 1),
        "factor_lms": round(factor_lms, 1),
        "factor_failed_credits": round(factor_failed, 1),
    }


def alert_worthy(level: str) -> bool:
    return level in ("Medium", "High", "Critical")
