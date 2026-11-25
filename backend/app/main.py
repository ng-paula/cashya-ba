"""
Cashya Ba? — FastAPI backend

Run:  uvicorn app.main:app --reload --port 8000
Docs: http://localhost:8000/docs  (interactive API documentation — use for Section 14 API specs)
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, SessionLocal, add_missing_columns, engine
from .routers import admin, auth, automation, budgets, chat, expenses, goals, household, notifications
from .seed import seed
from .services.rag import kb

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s: %(message)s")
log = logging.getLogger("cashya")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    add_missing_columns()
    with SessionLocal() as db:
        if settings.seed_demo_data and seed(db):
            log.info("Seeded demo accounts (password: cashya123)")
        indexed = kb.sync_folder(db)
        log.info("Knowledge base ready: %d file(s) (re)indexed, %d chunks", indexed, len(kb._chunks))
    log.info("AI mode: %s", f"LLM ({settings.provider}: {settings.model})" if settings.llm_enabled else f"rules (no {settings.provider.upper()}_API_KEY)")
    yield


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth, budgets, expenses, goals, household, chat, admin, automation, notifications):
    app.include_router(r.router)


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "aiMode": "llm" if settings.llm_enabled else "rules"}
