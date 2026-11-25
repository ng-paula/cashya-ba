"""App settings, loaded from environment variables or backend/.env"""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/

PROVIDER_DEFAULTS = {
    "gemini": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "model": "gemini-3.8-flash",
        "embedding_model": "gemini-embedding-001",
        # Measured with eval/testset.json: related questions 0.13–0.36, unrelated 0.42–0.54
        "max_distance": 0.40,
    },
    "openai": {
        "base_url": None,  # SDK default
        "model": "gpt-4o-mini",
        "embedding_model": "text-embedding-3-small",
        "max_distance": 0.65,  # not measured yet — re-tune if you switch to OpenAI
    },
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    # --- App ---
    app_name: str = "Cashya Ba? API"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- Database (SQLite by default; any SQLAlchemy URL works, e.g. PostgreSQL) ---
    database_url: str = f"sqlite:///{(BASE_DIR / 'data' / 'cashya.db').as_posix()}"

    # --- Auth ---
    jwt_secret: str = "change-me-in-production"
    jwt_expire_minutes: int = 60 * 24

    # --- LLM ---
    # Provider: "gemini" (free tier) or "openai". Both are called through the OpenAI Python SDK —
    # Gemini offers an OpenAI-compatible endpoint, so function calling and embeddings work the same way.
    # Leave the provider's key empty to run in offline "rules" mode (no AI costs, good for testing).
    llm_provider: str = "gemini"
    gemini_api_key: str = ""
    openai_api_key: str = ""
    # Optional overrides; empty = the provider's default (see PROVIDER_DEFAULTS)
    llm_model: str = ""
    embedding_model: str = ""
    llm_base_url: str = ""
    llm_temperature: float = 0.2

    # --- RAG ---
    kb_dir: Path = BASE_DIR / "knowledge_base"
    chroma_dir: Path = BASE_DIR / "data" / "chroma"
    rag_top_k: int = 3
    rag_max_distance: float = 0  # 0 = use the provider default (cosine distance cutoff for vector hits)

    # --- Automation (outgoing webhook) ---
    webhook_url: str = ""              # any webhook receiver, e.g. https://webhook.site/<your-id>
    n8n_webhook_url: str = ""          # older name, still read if WEBHOOK_URL is empty
    automation_api_key: str = "dev-automation-key"  # n8n sends this to call /api/automation/*

    # --- Seed demo data on first start ---
    seed_demo_data: bool = True

    @property
    def provider(self) -> str:
        p = self.llm_provider.strip().lower()
        return p if p in PROVIDER_DEFAULTS else "gemini"

    @property
    def api_key(self) -> str:
        return (self.gemini_api_key if self.provider == "gemini" else self.openai_api_key).strip()

    @property
    def base_url(self) -> str | None:
        return self.llm_base_url.strip() or PROVIDER_DEFAULTS[self.provider]["base_url"]

    @property
    def model(self) -> str:
        return self.llm_model.strip() or PROVIDER_DEFAULTS[self.provider]["model"]

    @property
    def embed_model(self) -> str:
        return self.embedding_model.strip() or PROVIDER_DEFAULTS[self.provider]["embedding_model"]

    @property
    def max_distance(self) -> float:
        return self.rag_max_distance or PROVIDER_DEFAULTS[self.provider]["max_distance"]

    @property
    def llm_enabled(self) -> bool:
        return bool(self.api_key)

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
