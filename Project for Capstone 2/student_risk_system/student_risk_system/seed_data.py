"""
Generates synthetic demo data: advisors + a batch of students with
realistic-looking GPA / attendance / LMS activity distributions, so the
system can be demoed before you plug in your own dataset.

Run standalone:  python seed_data.py
Or import seed_sample_students(db) / seed_advisors(db) from app.py
"""
import random
from models import db, Advisor, Student

FIRST_NAMES = [
    "Anh", "Minh", "Linh", "Huy", "Trang", "Nam", "Hoa", "Duc", "Mai", "Tuan",
    "Ngoc", "Phuong", "Quang", "Thao", "Khanh", "Bao", "Yen", "Long", "Hanh", "Vinh",
]
LAST_NAMES = ["Nguyen", "Tran", "Le", "Pham", "Hoang", "Vu", "Dang", "Bui", "Do", "Ngo"]
PROGRAMS = ["Information Systems", "Data Science", "Business Administration", "Computer Science"]
COHORTS = ["K67", "K68", "K69", "K70"]


def seed_advisors():
    if Advisor.query.count() > 0:
        return
    demo_advisors = [
        ("Dr. Le Advisor", "advisor1@school.edu.vn", "advisor123", "advisor"),
        ("Dr. Pham Advisor", "advisor2@school.edu.vn", "advisor123", "advisor"),
        ("Program Manager", "manager@school.edu.vn", "manager123", "manager"),
    ]
    for name, email, pw, role in demo_advisors:
        a = Advisor(name=name, email=email, role=role)
        a.set_password(pw)
        db.session.add(a)
    db.session.commit()


def _random_student_profile(risk_bias):
    """risk_bias in {'low','medium','high'} skews the generated numbers."""
    if risk_bias == "high":
        gpa = round(random.uniform(0.8, 2.0), 2)
        attendance = round(random.uniform(35, 65), 1)
        lms = round(random.uniform(5, 40), 1)
        failed = random.choice([1, 1, 2, 3])
    elif risk_bias == "medium":
        gpa = round(random.uniform(2.0, 2.7), 2)
        attendance = round(random.uniform(65, 82), 1)
        lms = round(random.uniform(30, 60), 1)
        failed = random.choice([0, 0, 1])
    else:
        gpa = round(random.uniform(2.7, 4.0), 2)
        attendance = round(random.uniform(82, 100), 1)
        lms = round(random.uniform(55, 100), 1)
        failed = 0
    return gpa, attendance, lms, failed


def seed_sample_students(n=60):
    """Adds n synthetic students (skipping if student_code already exists)."""
    existing_codes = {c for (c,) in db.session.query(Student.student_code).all()}
    start_index = len(existing_codes) + 1
    created = 0
    for i in range(start_index, start_index + n):
        code = f"SV{2000 + i}"
        if code in existing_codes:
            continue
        bias = random.choices(["low", "medium", "high"], weights=[0.55, 0.30, 0.15])[0]
        gpa, attendance, lms, failed = _random_student_profile(bias)
        student = Student(
            student_code=code,
            name=f"{random.choice(LAST_NAMES)} {random.choice(FIRST_NAMES)}",
            program=random.choice(PROGRAMS),
            cohort=random.choice(COHORTS),
            gpa=gpa,
            attendance_rate=attendance,
            lms_activity_score=lms,
            credits_failed=failed,
        )
        db.session.add(student)
        created += 1
    db.session.commit()
    return created


if __name__ == "__main__":
    from app import create_app

    app = create_app()
    with app.app_context():
        seed_advisors()
        n = seed_sample_students(60)
        print(f"Seeded advisors and {n} sample students.")
