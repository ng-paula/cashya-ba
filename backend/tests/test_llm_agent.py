"""
Agent-loop test with a fake LLM client (no network, no key needed).

Simulates a Gemini-style response: the model calls add_expense with NO tool-call id,
then writes a final answer. Checks the tool really ran against the database and that
every tool result message references a tool-call id.
"""
from types import SimpleNamespace as NS

from app.config import PROVIDER_DEFAULTS, Settings
from app.database import SessionLocal
from app.models import User
from app.services import llm, tools


class FakeCompletions:
    def __init__(self):
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        usage = NS(prompt_tokens=10, completion_tokens=5)
        if len(self.calls) == 1:
            call = NS(id=None, function=NS(name="add_expense",
                                           arguments='{"amount": 99, "category": "food", "note": "Siopao"}'))
            return NS(usage=usage, choices=[NS(message=NS(content=None, tool_calls=[call]))])
        return NS(usage=usage, choices=[NS(message=NS(content="Logged ₱99 for Siopao.", tool_calls=None))])


def test_agent_loop_runs_tools_without_ids(monkeypatch, client):
    fake = FakeCompletions()
    monkeypatch.setattr(llm, "client", lambda: NS(chat=NS(completions=fake)))

    with SessionLocal() as db:
        user = db.query(User).filter_by(email="juan@cashya.demo").one()
        ctx = tools.ToolContext(db=db, user=user)
        result = llm.run(ctx, user, "siopao 99", history=[], budget_type="sahod")

        assert result.reply == "Logged ₱99 for Siopao."
        assert [c["name"] for c in ctx.calls] == ["add_expense"]
        assert ctx.new_expenses[0].amount == 99
        assert result.prompt_tokens == 20

    second = fake.calls[1]["messages"]
    tool_msgs = [m for m in second if m["role"] == "tool"]
    assistant = [m for m in second if m["role"] == "assistant"][0]
    assert tool_msgs[0]["tool_call_id"] == assistant["tool_calls"][0]["id"]  # generated id links them


def test_provider_defaults():
    g = Settings(llm_provider="gemini", gemini_api_key="x", _env_file=None)
    assert g.llm_enabled and g.model == PROVIDER_DEFAULTS["gemini"]["model"]
    assert "generativelanguage" in g.base_url

    o = Settings(llm_provider="openai", openai_api_key="", gemini_api_key="x", _env_file=None)
    assert not o.llm_enabled  # openai selected but no openai key → rules mode
    assert o.base_url is None

    custom = Settings(llm_provider="gemini", llm_model="gemini-custom", _env_file=None)
    assert custom.model == "gemini-custom"
