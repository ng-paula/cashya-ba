"""Admin-only endpoints: knowledge base management, metrics, guardrail log, user roles."""
import json
import re
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import BASE_DIR, settings
from ..database import get_db
from ..models import AutomationEvent, ChatLog, Expense, KBChunk, KBDocument, User
from ..schemas import CamelModel, KBDocumentOut, Role
from ..security import require_roles
from ..services.rag import kb

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_roles("admin"))])

EVAL_RESULTS = BASE_DIR / "eval" / "results.json"
MAX_UPLOAD_BYTES = 5 * 1024 * 1024


# ---------- Knowledge base ----------
@router.get("/kb", response_model=list[KBDocumentOut])
def list_documents(db: Session = Depends(get_db)):
    docs = db.scalars(select(KBDocument).order_by(KBDocument.updated_at.desc()))
    return [KBDocumentOut(id=d.id, title=d.title, file_type=d.file_type, status=d.status,
                          chunks=len(d.chunks), updated_at=d.updated_at) for d in docs]


@router.post("/kb", response_model=KBDocumentOut, status_code=201)
async def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    name = re.sub(r"[^\w.\-]", "_", file.filename or "document.txt")
    if not name.lower().endswith((".md", ".txt", ".pdf")):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only .md, .txt, or .pdf files")
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File is larger than 5 MB")
    path = settings.kb_dir / name
    path.write_bytes(content)
    doc = kb.index_file(db, path)
    return KBDocumentOut(id=doc.id, title=doc.title, file_type=doc.file_type, status=doc.status,
                         chunks=len(doc.chunks), updated_at=doc.updated_at)


@router.delete("/kb/{doc_id}", status_code=204)
def delete_document(doc_id: int, db: Session = Depends(get_db)):
    doc = db.get(KBDocument, doc_id)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    kb.delete_document(db, doc)


@router.get("/kb/search")
def test_search(q: str):
    """Lets the admin try retrieval directly (useful in the defense demo)."""
    return [h.__dict__ for h in kb.search(q)]


# ---------- Metrics ----------
@router.get("/metrics")
def metrics(db: Session = Depends(get_db)):
    today_start = datetime.combine(date.today(), time.min)
    week_ago = datetime.now() - timedelta(days=7)
    month_ago = datetime.now() - timedelta(days=30)

    active_users = db.scalar(
        select(func.count(func.distinct(Expense.user_id))).where(Expense.created_at >= month_ago)
    ) or 0
    logs_week = list(db.scalars(select(ChatLog).where(ChatLog.created_at >= week_ago)))
    answered = [l for l in logs_week if l.action in ("answered", "redacted")]
    latencies = sorted(l.latency_ms for l in answered)

    # Latency per day for the last 7 days
    series = []
    for i in range(6, -1, -1):
        d = date.today() - timedelta(days=i)
        day_lat = [l.latency_ms for l in answered if l.created_at.date() == d]
        series.append({"label": d.strftime("%a"), "value": round(sum(day_lat) / len(day_lat) / 1000, 2) if day_lat else 0})

    evaluation = json.loads(EVAL_RESULTS.read_text()) if EVAL_RESULTS.exists() else None

    return {
        "usage": {
            "totalUsers": db.scalar(select(func.count(User.id))) or 0,
            "activeUsers": active_users,
            "expensesToday": db.scalar(select(func.count(Expense.id)).where(Expense.created_at >= today_start)) or 0,
            "chatsToday": db.scalar(select(func.count(ChatLog.id)).where(ChatLog.created_at >= today_start)) or 0,
            "kbChunks": db.scalar(select(func.count(KBChunk.id))) or 0,
        },
        "ai": {
            "mode": "llm" if settings.llm_enabled else "rules",
            "model": f"{settings.provider} · {settings.model}" if settings.llm_enabled else "rules (offline)",
            "chatsThisWeek": len(logs_week),
            "avgLatencyMs": int(sum(latencies) / len(latencies)) if latencies else 0,
            "p95LatencyMs": latencies[int(len(latencies) * 0.95) - 1] if latencies else 0,
            "guardrailFlagsThisWeek": sum(1 for l in logs_week if l.flags),
            "tokensThisWeek": sum(l.prompt_tokens + l.completion_tokens for l in logs_week),
            "intents": _count([l.intent for l in logs_week]),
        },
        "latencySeries": series,
        "evaluation": evaluation,
    }


def _count(items: list[str]) -> dict:
    out: dict[str, int] = {}
    for i in items:
        out[i] = out.get(i, 0) + 1
    return dict(sorted(out.items(), key=lambda x: x[1], reverse=True))


@router.get("/guardrails")
def guardrail_log(db: Session = Depends(get_db)):
    rows = db.scalars(select(ChatLog).where(ChatLog.action != "answered").order_by(ChatLog.id.desc()).limit(30))
    labels = {"pii": "PII detected", "injection": "Prompt injection", "off_limits": "Out of scope"}
    return [{
        "id": r.id,
        "user": f"user_{r.user_id:04d}",
        "type": ", ".join(labels.get(f, f) for f in r.flags) or r.action,
        "text": r.message,  # already masked
        "action": r.action.capitalize(),
        "time": r.created_at.isoformat(timespec="minutes"),
    } for r in rows]


@router.get("/automation")
def automation_log(db: Session = Depends(get_db)):
    rows = db.scalars(select(AutomationEvent).order_by(AutomationEvent.id.desc()).limit(30))
    return [{"id": r.id, "event": r.event, "status": r.status, "message": r.payload.get("message", ""),
             "time": r.created_at.isoformat(timespec="minutes")} for r in rows]


# ---------- Users / roles ----------
class RoleIn(CamelModel):
    role: Role


@router.get("/users")
def list_users(db: Session = Depends(get_db)):
    return [{"id": u.id, "email": u.email, "fullName": u.full_name, "role": u.role}
            for u in db.scalars(select(User).order_by(User.id))]


@router.patch("/users/{user_id}/role")
def set_role(user_id: int, data: RoleIn, admin: User = Depends(require_roles("admin")), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.id == admin.id and data.role != "admin":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't remove your own admin role")
    user.role = data.role
    db.commit()
    return {"id": user.id, "role": user.role}
