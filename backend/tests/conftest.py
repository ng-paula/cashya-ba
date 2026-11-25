"""Test setup: every test session uses a fresh temporary SQLite database in rules mode."""
import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["CHROMA_DIR"] = f"{_tmp}/chroma"
os.environ["OPENAI_API_KEY"] = ""  # tests never call a real LLM API
os.environ["GEMINI_API_KEY"] = ""
os.environ["N8N_WEBHOOK_URL"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def login(client, email: str) -> dict:
    r = client.post("/api/auth/login", json={"email": email, "password": "cashya123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="session")
def juan(client):
    return login(client, "juan@cashya.demo")


@pytest.fixture(scope="session")
def admin(client):
    return login(client, "admin@cashya.demo")


@pytest.fixture(scope="session")
def ben(client):
    return login(client, "ben@cashya.demo")


@pytest.fixture(scope="session")
def maria(client):
    return login(client, "maria@cashya.demo")
