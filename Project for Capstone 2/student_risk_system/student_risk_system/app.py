import os
from datetime import datetime, timedelta
from functools import wraps

from flask import (
    Flask, render_template, request, redirect, url_for, session, flash, jsonify
)
import pandas as pd

from models import db, Advisor, Student, RiskScore, Alert, Intervention
from risk_engine import compute_risk, alert_worthy
import seed_data

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-me")
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + os.path.join(BASE_DIR, "risk_system.db")
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    db.init_app(app)

    with app.app_context():
        db.create_all()
        seed_data.seed_advisors()

    register_routes(app)
    return app


# --------------------------------------------------------------------------
# Auth helpers
# --------------------------------------------------------------------------
def login_required(view_func):
    @wraps(view_func)
    def wrapped(*args, **kwargs):
        if not session.get("advisor_id"):
            return redirect(url_for("login"))
        return view_func(*args, **kwargs)
    return wrapped


def current_advisor():
    aid = session.get("advisor_id")
    return Advisor.query.get(aid) if aid else None


# --------------------------------------------------------------------------
# Core risk pipeline (shared by import, seeding, manual recompute)
# --------------------------------------------------------------------------
def recompute_and_alert(student, advisor_for_new_alerts=None):
    """Compute risk for a student, store a RiskScore snapshot, and open a new
    Alert if the student crosses into Medium/High/Critical and doesn't
    already have an open alert."""
    result = compute_risk(student)
    snapshot = RiskScore(
        student_id=student.id,
        score=result["score"],
        risk_level=result["level"],
        factor_gpa=result["factor_gpa"],
        factor_attendance=result["factor_attendance"],
        factor_lms=result["factor_lms"],
        factor_failed_credits=result["factor_failed_credits"],
    )
    db.session.add(snapshot)

    if alert_worthy(result["level"]):
        open_alert = Alert.query.filter_by(student_id=student.id, status="Open").first()
        if not open_alert:
            new_alert = Alert(
                student_id=student.id,
                risk_level=result["level"],
                score_at_alert=result["score"],
                status="Open",
                advisor_id=advisor_for_new_alerts,
            )
            db.session.add(new_alert)
    return result


def register_routes(app):

    # ---------------------------------------------------------------- auth
    @app.route("/login", methods=["GET", "POST"])
    def login():
        if request.method == "POST":
            email = request.form.get("email", "").strip().lower()
            password = request.form.get("password", "")
            advisor = Advisor.query.filter_by(email=email).first()
            if advisor and advisor.check_password(password):
                session["advisor_id"] = advisor.id
                session["advisor_name"] = advisor.name
                flash(f"Welcome back, {advisor.name}.", "success")
                return redirect(url_for("dashboard"))
            flash("Invalid email or password.", "error")
        return render_template("login.html")

    @app.route("/logout")
    def logout():
        session.clear()
        return redirect(url_for("login"))

    # ----------------------------------------------------------- dashboard
    @app.route("/")
    @login_required
    def dashboard():
        students = Student.query.all()
        total = len(students)

        level_counts = {"Low": 0, "Medium": 0, "High": 0, "Critical": 0, "Unscored": 0}
        risky_students = []
        for s in students:
            lr = s.latest_risk
            if lr:
                level_counts[lr.risk_level] += 1
                risky_students.append((s, lr))
            else:
                level_counts["Unscored"] += 1

        risky_students.sort(key=lambda pair: pair[1].score, reverse=True)
        top_risk = risky_students[:8]

        open_alerts = Alert.query.filter_by(status="Open").count()
        in_progress_alerts = Alert.query.filter(Alert.status.in_(["Acknowledged"])).count()
        resolved_alerts = Alert.query.filter_by(status="Resolved").count()

        # naive detection lead time proxy: days between first risk snapshot >= Medium
        # and the alert creation, averaged (usually ~0 since we alert immediately,
        # but kept as a genuine KPI hook for when scoring runs on a schedule)
        recent_alerts = Alert.query.order_by(Alert.created_at.desc()).limit(30).all()

        trend_labels, trend_values = _risk_trend_series()

        return render_template(
            "dashboard.html",
            total=total,
            level_counts=level_counts,
            top_risk=top_risk,
            open_alerts=open_alerts,
            in_progress_alerts=in_progress_alerts,
            resolved_alerts=resolved_alerts,
            recent_alerts=recent_alerts,
            trend_labels=trend_labels,
            trend_values=trend_values,
            advisor=current_advisor(),
        )

    # ------------------------------------------------------------ students
    @app.route("/students")
    @login_required
    def students_list():
        q = request.args.get("q", "").strip()
        level = request.args.get("level", "")

        query = Student.query
        if q:
            like = f"%{q}%"
            query = query.filter(db.or_(Student.name.ilike(like), Student.student_code.ilike(like)))
        students = query.order_by(Student.name).all()

        rows = []
        for s in students:
            lr = s.latest_risk
            if level and (not lr or lr.risk_level != level):
                continue
            rows.append((s, lr))

        rows.sort(key=lambda pair: (pair[1].score if pair[1] else -1), reverse=True)

        return render_template(
            "students.html", rows=rows, q=q, level=level, advisor=current_advisor()
        )

    @app.route("/students/<int:student_id>")
    @login_required
    def student_detail(student_id):
        student = Student.query.get_or_404(student_id)
        history = list(reversed(student.risk_scores[:20]))
        advisors = Advisor.query.all()
        return render_template(
            "student_detail.html",
            student=student,
            history=history,
            advisors=advisors,
            advisor=current_advisor(),
        )

    @app.route("/students/<int:student_id>/recompute", methods=["POST"])
    @login_required
    def student_recompute(student_id):
        student = Student.query.get_or_404(student_id)
        recompute_and_alert(student)
        db.session.commit()
        flash(f"Risk recomputed for {student.name}.", "success")
        return redirect(url_for("student_detail", student_id=student.id))

    @app.route("/students/<int:student_id>/edit", methods=["POST"])
    @login_required
    def student_edit(student_id):
        student = Student.query.get_or_404(student_id)
        try:
            student.gpa = float(request.form.get("gpa", student.gpa))
            student.attendance_rate = float(request.form.get("attendance_rate", student.attendance_rate))
            student.lms_activity_score = float(request.form.get("lms_activity_score", student.lms_activity_score))
            student.credits_failed = int(request.form.get("credits_failed", student.credits_failed))
            student.program = request.form.get("program", student.program)
            student.cohort = request.form.get("cohort", student.cohort)
        except ValueError:
            flash("Please enter valid numbers.", "error")
            return redirect(url_for("student_detail", student_id=student.id))

        recompute_and_alert(student)
        db.session.commit()
        flash(f"Updated profile and recomputed risk for {student.name}.", "success")
        return redirect(url_for("student_detail", student_id=student.id))

    @app.route("/students/new", methods=["GET", "POST"])
    @login_required
    def student_new():
        if request.method == "POST":
            code = request.form.get("student_code", "").strip()
            if not code:
                flash("Student code is required.", "error")
                return redirect(url_for("student_new"))
            if Student.query.filter_by(student_code=code).first():
                flash("A student with that code already exists.", "error")
                return redirect(url_for("student_new"))
            student = Student(
                student_code=code,
                name=request.form.get("name", "").strip(),
                program=request.form.get("program", "").strip(),
                cohort=request.form.get("cohort", "").strip(),
                gpa=float(request.form.get("gpa") or 0),
                attendance_rate=float(request.form.get("attendance_rate") or 100),
                lms_activity_score=float(request.form.get("lms_activity_score") or 100),
                credits_failed=int(request.form.get("credits_failed") or 0),
            )
            db.session.add(student)
            db.session.flush()
            recompute_and_alert(student)
            db.session.commit()
            flash(f"Added {student.name}.", "success")
            return redirect(url_for("student_detail", student_id=student.id))

        return render_template("student_new.html", advisor=current_advisor())

    # -------------------------------------------------------------- alerts
    @app.route("/alerts")
    @login_required
    def alerts_list():
        status = request.args.get("status", "Open")
        query = Alert.query
        if status and status != "All":
            query = query.filter_by(status=status)
        alerts = query.order_by(Alert.created_at.desc()).all()
        advisors = Advisor.query.all()
        return render_template(
            "alerts.html", alerts=alerts, status=status, advisors=advisors, advisor=current_advisor()
        )

    @app.route("/alerts/<int:alert_id>/assign", methods=["POST"])
    @login_required
    def alert_assign(alert_id):
        alert = Alert.query.get_or_404(alert_id)
        advisor_id = request.form.get("advisor_id")
        alert.advisor_id = int(advisor_id) if advisor_id else None
        if alert.status == "Open" and alert.advisor_id:
            alert.status = "Acknowledged"
        db.session.commit()
        flash("Alert assignment updated.", "success")
        return redirect(url_for("alerts_list"))

    @app.route("/alerts/<int:alert_id>/status", methods=["POST"])
    @login_required
    def alert_status(alert_id):
        alert = Alert.query.get_or_404(alert_id)
        new_status = request.form.get("status")
        if new_status in ("Open", "Acknowledged", "Resolved", "Dismissed"):
            alert.status = new_status
            if new_status == "Resolved":
                alert.resolved_at = datetime.utcnow()
        db.session.commit()
        flash("Alert status updated.", "success")
        return redirect(request.referrer or url_for("alerts_list"))

    # -------------------------------------------------------- interventions
    @app.route("/alerts/<int:alert_id>/interventions/new", methods=["POST"])
    @login_required
    def intervention_new(alert_id):
        alert = Alert.query.get_or_404(alert_id)
        advisor = current_advisor()
        intervention = Intervention(
            alert_id=alert.id,
            advisor_id=advisor.id,
            action_type=request.form.get("action_type", "Advising meeting"),
            notes=request.form.get("notes", ""),
            status=request.form.get("status", "Planned"),
        )
        db.session.add(intervention)
        if alert.status == "Open":
            alert.status = "Acknowledged"
        db.session.commit()
        flash("Intervention logged.", "success")
        return redirect(url_for("student_detail", student_id=alert.student_id))

    @app.route("/interventions")
    @login_required
    def interventions_list():
        interventions = Intervention.query.order_by(Intervention.created_at.desc()).all()
        return render_template("interventions.html", interventions=interventions, advisor=current_advisor())

    # -------------------------------------------------------------- import
    @app.route("/import", methods=["GET", "POST"])
    @login_required
    def import_data():
        if request.method == "POST":
            file = request.files.get("csv_file")
            if not file or file.filename == "":
                flash("Please choose a CSV file.", "error")
                return redirect(url_for("import_data"))
            try:
                df = pd.read_csv(file)
            except Exception as e:
                flash(f"Could not read CSV: {e}", "error")
                return redirect(url_for("import_data"))

            required_cols = {"student_code", "name"}
            if not required_cols.issubset(set(c.strip() for c in df.columns)):
                flash("CSV must include at least 'student_code' and 'name' columns.", "error")
                return redirect(url_for("import_data"))

            created, updated = 0, 0
            for _, row in df.iterrows():
                code = str(row.get("student_code", "")).strip()
                if not code or code == "nan":
                    continue
                student = Student.query.filter_by(student_code=code).first()
                if not student:
                    student = Student(student_code=code)
                    db.session.add(student)
                    created += 1
                else:
                    updated += 1

                student.name = str(row.get("name", student.name or ""))
                student.program = str(row.get("program", student.program or ""))
                student.cohort = str(row.get("cohort", student.cohort or ""))
                student.gpa = float(row.get("gpa", student.gpa or 0) or 0)
                student.attendance_rate = float(row.get("attendance_rate", student.attendance_rate or 100) or 100)
                student.lms_activity_score = float(row.get("lms_activity_score", student.lms_activity_score or 100) or 100)
                student.credits_failed = int(row.get("credits_failed", student.credits_failed or 0) or 0)
                db.session.flush()
                recompute_and_alert(student)

            db.session.commit()
            flash(f"Import complete: {created} new students, {updated} updated.", "success")
            return redirect(url_for("students_list"))

        return render_template("import_data.html", advisor=current_advisor())

    @app.route("/import/sample", methods=["POST"])
    @login_required
    def import_sample():
        n = seed_data.seed_sample_students(60)
        # recompute risk for anyone missing a score
        for s in Student.query.all():
            if not s.latest_risk:
                recompute_and_alert(s)
        db.session.commit()
        flash(f"Loaded {n} sample students for demo purposes.", "success")
        return redirect(url_for("students_list"))

    @app.route("/import/template.csv")
    @login_required
    def import_template():
        from flask import Response
        sample = (
            "student_code,name,program,cohort,gpa,attendance_rate,lms_activity_score,credits_failed\n"
            "SV1001,Nguyen Van A,Information Systems,K68,2.1,68,35,1\n"
            "SV1002,Tran Thi B,Data Science,K69,3.4,95,80,0\n"
        )
        return Response(
            sample, mimetype="text/csv",
            headers={"Content-Disposition": "attachment;filename=student_import_template.csv"},
        )

    # --------------------------------------------------------------- misc
    @app.route("/api/dashboard-trend")
    @login_required
    def api_dashboard_trend():
        labels, values = _risk_trend_series()
        return jsonify({"labels": labels, "values": values})


def _risk_trend_series(days=14):
    """Number of Medium+ risk snapshots per day for the last `days` days —
    powers the dashboard trend chart."""
    today = datetime.utcnow().date()
    labels, values = [], []
    for i in range(days - 1, -1, -1):
        day = today - timedelta(days=i)
        start = datetime.combine(day, datetime.min.time())
        end = start + timedelta(days=1)
        count = (
            RiskScore.query.filter(
                RiskScore.computed_at >= start,
                RiskScore.computed_at < end,
                RiskScore.risk_level.in_(["Medium", "High", "Critical"]),
            ).count()
        )
        labels.append(day.strftime("%d/%m"))
        values.append(count)
    return labels, values


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
