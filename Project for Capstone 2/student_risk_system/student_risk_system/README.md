# Sentinel — Student Risk Alert System (Academic DSS)

Capstone-ready MIS prototype for INS3282: a full-stack web app (not just an
ML notebook) that supports the whole workflow required by the brief —
academic profile → explainable risk scoring → alert → advisor
assignment → intervention case record → dashboard evaluation.

## Tech stack

- **Backend:** Flask 3 + Flask-SQLAlchemy
- **Database:** SQLite (file-based, zero config; swap the URI in `app.py`
  for PostgreSQL/MySQL later if you need to deploy for real users)
- **Frontend:** server-rendered Jinja templates + Chart.js (loaded from CDN)
- **Auth:** simple session-based login with hashed passwords (Werkzeug)

## Why rule-based scoring, not a black-box ML model

The guide explicitly warns: *"Do not submit only an ML classification
model."* This version uses a transparent, weighted rule engine
(`risk_engine.py`) so every score can be explained factor-by-factor to an
advisor. If your course wants a trained ML model too, you can swap
`compute_risk()` for a scikit-learn model and still keep every other part
of the system (alerts, workflow, case management, dashboard) — that's the
part markers are checking is *not* missing.

## How risk is computed

Four indicators, each turned into a 0–100 "risk contribution", then
combined with fixed weights:

| Factor | Weight | Flagged when |
|---|---|---|
| GPA (0–4) | 40% | below ~2.5, maxes out below 0 |
| Attendance rate (%) | 30% | below ~85% |
| LMS activity score (0–100) | 15% | below ~60 |
| Failed credits this term | 15% | any failure, maxes at 3+ |

Composite score 0–100 → **Low** (<40) / **Medium** (40–65) / **High**
(65–85) / **Critical** (85+). Crossing into Medium+ automatically opens an
**Alert**; advisors assign themselves, log **Interventions**, and resolve
the alert. Tune the weights/thresholds in `risk_engine.py` to match your
case study.

## Project structure

```
student_risk_system/
├── app.py              # routes, auth, risk pipeline glue
├── models.py            # SQLAlchemy schema (Advisor, Student, RiskScore, Alert, Intervention)
├── risk_engine.py        # explainable rule-based scoring
├── seed_data.py          # demo advisors + synthetic student generator
├── requirements.txt
├── templates/            # Jinja HTML (dashboard, students, alerts, interventions, import)
└── static/css, static/js
```

## Run it locally

```bash
cd student_risk_system
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open **http://localhost:5000**. The database (`risk_system.db`) and three
demo advisor accounts are created automatically on first run:

| Email | Password | Role |
|---|---|---|
| advisor1@school.edu.vn | advisor123 | advisor |
| advisor2@school.edu.vn | advisor123 | advisor |
| manager@school.edu.vn | manager123 | manager |

Change these in `seed_data.py` before submitting/deploying.

## Getting data in

You have two options from the **Import data** page:

1. **Load 60 sample students** — one click, generates a realistic
   synthetic dataset (varied GPA/attendance/LMS/failures) so you can demo
   the whole workflow immediately.
2. **Upload your own CSV** — required columns `student_code, name`;
   optional `program, cohort, gpa, attendance_rate, lms_activity_score,
   credits_failed`. Existing students (matched by `student_code`) are
   updated, not duplicated, so you can re-import an updated CSV every
   week/month to simulate a real data feed. A template is downloadable
   from the same page.

If you don't have a real dataset yet, good public options for adapting
this project: Kaggle "Students Performance in Exams", "Student Dropout
and Academic Success", or the UCI Student Performance dataset — just map
their columns to the CSV template.

## Deploying beyond your laptop (optional)

For a live demo link, this app runs as-is on:
- **Render** or **Railway** (free tier, push this folder to GitHub, add a
  `Procfile` with `web: python app.py`, set `PORT` env var if required)
- **PythonAnywhere** (good for a persistent SQLite file)

For a real multi-advisor deployment, swap SQLite for PostgreSQL by
changing `SQLALCHEMY_DATABASE_URI` in `app.py`.

## Mapping back to the capstone rubric

| Guide requirement | Where it lives |
|---|---|
| Student academic profile & data import | `/import`, `models.Student` |
| Risk indicators, thresholds, scoring rules | `risk_engine.py` |
| Risk list & explainable risk factors | `/students`, `/students/<id>` (factor bars) |
| Alert generation & advisor assignment | `models.Alert`, `/alerts` |
| Intervention / case records | `models.Intervention`, logged from student detail page |
| Risk & intervention dashboard | `/` (KPIs, trend, distribution, top-risk table) |

## Known limitations to disclose in your report

- Rule-based, not ML-based — a deliberate choice for explainability, but
  worth mentioning as a discussion point / future work (e.g. compare
  against a trained classifier).
- Single-tenant SQLite — fine for a capstone demo, not for production
  scale.
- No email/SMS notifications wired up — alerts only surface inside the
  app; would be a natural "optional advanced extension" to add.
