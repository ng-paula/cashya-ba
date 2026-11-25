"""
Evaluation script (rubric: Evaluation & Testing — 15%)

Measures:
  1. Categorization accuracy — does the AI put expenses in the right category? (EN / TL / Taglish)
  2. Retrieval hit@3 + MRR   — does RAG find the right document for each question?
  3. Out-of-scope rejection   — does RAG return nothing for unrelated questions? (anti-hallucination)
  4. Guardrail detection      — attacks blocked, benign messages allowed, PII masked
  5. Latency                  — average / p95 time per categorization call

Usage (from backend/):
  python -m eval.run_eval            # uses LLM if OPENAI_API_KEY is set, else rules mode
  python -m eval.run_eval --rules    # force rules mode (baseline, free)

Writes eval/results.json → shown on the Admin dashboard.
"""
import argparse
import json
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.services import guardrails, rules_engine  # noqa: E402
from app.services.rag import kb  # noqa: E402
from app.services.tools import TOOL_SCHEMAS  # noqa: E402

HERE = Path(__file__).resolve().parent
TESTSET = json.loads((HERE / "testset.json").read_text(encoding="utf-8"))


def categorize_llm(text: str) -> str:
    from app.services.llm import client

    add_expense = next(t for t in TOOL_SCHEMAS if t["function"]["name"] == "add_expense")
    resp = client().chat.completions.create(
        model=settings.model,
        temperature=0,
        messages=[{"role": "system", "content": "Log the user's expense with add_expense."},
                  {"role": "user", "content": text}],
        tools=[add_expense],
        tool_choice={"type": "function", "function": {"name": "add_expense"}},
    )
    args = json.loads(resp.choices[0].message.tool_calls[0].function.arguments)
    return args.get("category", "others")


def categorize_rules(text: str) -> str:
    items = rules_engine.parse_expenses(text)
    return items[0]["category"] if items else "others"


def run(use_llm: bool) -> dict:
    mode = "llm" if use_llm else "rules"
    print(f"\n=== Cashya Ba? evaluation — mode: {mode} ===\n")

    # 1) Categorization
    fn = categorize_llm if use_llm else categorize_rules
    correct, latencies, mistakes = 0, [], []
    for case in TESTSET["categorization"]:
        t0 = time.perf_counter()
        got = fn(case["text"])
        latencies.append((time.perf_counter() - t0) * 1000)
        if got == case["category"]:
            correct += 1
        else:
            mistakes.append({"text": case["text"], "expected": case["category"], "got": got})
    n = len(TESTSET["categorization"])
    cat_acc = correct / n
    print(f"Categorization accuracy: {cat_acc:.1%} ({correct}/{n})")
    for m in mistakes[:10]:
        print(f"   ✗ {m['text']!r}: expected {m['expected']}, got {m['got']}")

    # 2) Retrieval
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        kb.sync_folder(db)
    hits, rr = 0, []
    for case in TESTSET["retrieval"]:
        titles = [h.title for h in kb.search(case["question"], k=3)]
        if case["expected"] in titles:
            hits += 1
            rr.append(1 / (titles.index(case["expected"]) + 1))
        else:
            rr.append(0)
            print(f"   ✗ retrieval miss: {case['question']!r} → {titles}")
    nr = len(TESTSET["retrieval"])
    print(f"Retrieval hit@3: {hits / nr:.1%} ({hits}/{nr})   MRR: {statistics.mean(rr):.2f}")

    # 3) Out-of-scope → should retrieve nothing
    oos_ok = sum(1 for q in TESTSET["out_of_scope"] if not kb.search(q))
    print(f"Out-of-scope rejection: {oos_ok}/{len(TESTSET['out_of_scope'])}")

    # 4) Guardrails
    g = TESTSET["guardrails"]
    attacks_caught = sum(1 for t in g["attacks"] if (r := guardrails.check_input(t)).blocked or r.refused)
    benign_passed = sum(1 for t in g["benign"] if not (r := guardrails.check_input(t)).blocked and not r.refused)
    pii_masked = sum(1 for t in g["pii"] if "pii" in guardrails.check_input(t).flags)
    print(f"Guardrails: attacks caught {attacks_caught}/{len(g['attacks'])}, "
          f"benign allowed {benign_passed}/{len(g['benign'])}, PII masked {pii_masked}/{len(g['pii'])}")

    lat_sorted = sorted(latencies)
    results = {
        "runAt": datetime.now().isoformat(timespec="minutes"),
        "mode": mode,
        "model": f"{settings.provider} · {settings.model}" if use_llm else "rules",
        "categorization": {"accuracy": round(cat_acc, 3), "correct": correct, "total": n, "mistakes": mistakes},
        "retrieval": {"hitAt3": round(hits / nr, 3), "mrr": round(statistics.mean(rr), 3), "total": nr},
        "outOfScope": {"rejected": oos_ok, "total": len(TESTSET["out_of_scope"])},
        "guardrails": {
            "attacksCaught": attacks_caught, "attacksTotal": len(g["attacks"]),
            "benignAllowed": benign_passed, "benignTotal": len(g["benign"]),
            "piiMasked": pii_masked, "piiTotal": len(g["pii"]),
        },
        "latency": {"avgMs": round(statistics.mean(latencies), 1), "p95Ms": round(lat_sorted[int(len(lat_sorted) * 0.95) - 1], 1)},
    }
    (HERE / "results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nSaved → {HERE / 'results.json'}")
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--rules", action="store_true", help="force offline rules mode")
    args = parser.parse_args()
    run(use_llm=settings.llm_enabled and not args.rules)
