"""
POST /api/chat — the full AI pipeline:

  user message
    → INPUT guardrails (mask PII, block injection, refuse off-limits topics)
    → LLM agent with function calling   (or rules mode if no API key / API error)
    → OUTPUT guardrails (mask PII, canary leak check)
    → save conversation + log metrics (latency, tokens, flags) for the admin dashboard
"""
import logging
import time

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import ChatLog, ChatMessage, User
from ..schemas import ChatHistoryItem, ChatIn, ChatOut, ExpenseOut, ToolCallOut
from ..security import get_current_user
from ..services import budget_service, guardrails, llm, rules_engine, tools

router = APIRouter(prefix="/api/chat", tags=["chat"])
log = logging.getLogger(__name__)
HISTORY_TURNS = 8


@router.post("", response_model=ChatOut)
def chat(data: ChatIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    started = time.perf_counter()
    guard = guardrails.check_input(data.message)
    ctx = tools.ToolContext(db=db, user=user)
    mode = "llm" if settings.llm_enabled else "rules"
    action = "redacted" if "pii" in guard.flags else "answered"
    result = llm.AgentResult(reply="", ctx=ctx)

    if guard.blocked:
        result.reply, result.intent, action = guardrails.BLOCKED_REPLY, "blocked", "blocked"
    elif guard.refused:
        result.reply, result.intent, action = guardrails.REFUSED_REPLY, "refused", "refused"
    else:
        history = [
            {"role": m.role, "content": m.content}
            for m in reversed(list(db.scalars(
                select(ChatMessage).where(ChatMessage.user_id == user.id).order_by(ChatMessage.id.desc()).limit(HISTORY_TURNS)
            )))
        ]
        budget = budget_service.active_budget(db, user)
        if mode == "llm":
            try:
                result = llm.run(ctx, user, guard.clean_text, history, budget.type if budget else None)
            except Exception as exc:  # API down / quota / bad key → keep working offline
                log.warning("LLM failed, falling back to rules mode: %s", exc)
                mode = "rules"
        if mode == "rules":
            result = rules_engine.run(ctx, guard.clean_text)

    reply = guardrails.check_output(result.reply)
    if "pii" in guard.flags and action == "answered":
        action = "redacted"
    if "pii" in guard.flags:
        reply += " (I hid your personal info for your safety.)"

    # Sources: only the ones the answer actually cited
    cited = set(result.cited)
    sources = [f"{s['title']} — {s['heading']}" for s in ctx.sources if s["n"] in cited]
    latency_ms = int((time.perf_counter() - started) * 1000)

    tool_calls = [ToolCallOut(name=c["name"], args=c["args"]) for c in ctx.calls]
    meta = {"toolCalls": [t.model_dump() for t in tool_calls], "sources": sources, "flags": guard.flags}
    db.add_all([
        ChatMessage(user_id=user.id, role="user", content=guard.clean_text, meta={"flags": guard.flags}),
        ChatMessage(user_id=user.id, role="assistant", content=reply, meta=meta),
        ChatLog(user_id=user.id, message=guard.clean_text, mode=mode, intent=result.intent,
                tool_calls=meta["toolCalls"], flags=guard.flags, action=action, latency_ms=latency_ms,
                prompt_tokens=result.prompt_tokens, completion_tokens=result.completion_tokens),
    ])
    db.commit()

    return ChatOut(
        reply=reply,
        clean_text=guard.clean_text,
        flags=guard.flags,
        tool_calls=tool_calls,
        sources=sources,
        new_expenses=[ExpenseOut.model_validate(e) for e in ctx.new_expenses],
        mode=mode,
        latency_ms=latency_ms,
    )


@router.get("/history", response_model=list[ChatHistoryItem])
def history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(ChatMessage).where(ChatMessage.user_id == user.id).order_by(ChatMessage.id.desc()).limit(50))
    return list(reversed(list(rows)))


@router.delete("/history", status_code=204)
def clear_history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(delete(ChatMessage).where(ChatMessage.user_id == user.id))
    db.commit()
