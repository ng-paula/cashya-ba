"""
RAG — Retrieval-Augmented Generation (rubric: Core AI & RAG — 25%)

Pipeline:
  knowledge_base/*.md|.txt|.pdf
     → chunk by heading (~800 chars)
     → store chunks in SQL (kb_chunks)
     → BM25 keyword index (always on)
     → vector index in ChromaDB with OpenAI embeddings (when OPENAI_API_KEY is set)
  question
     → hybrid search: BM25 ranks + vector ranks merged with Reciprocal Rank Fusion
     → top-k chunks (with document titles) returned to the LLM for grounded, cited answers
"""
import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from rank_bm25 import BM25Okapi
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import KBChunk, KBDocument

log = logging.getLogger(__name__)

# ChromaDB telemetry is turned off below; this ChromaDB version still logs noisy
# "Failed to send telemetry" errors from its posthog client, so hide those.
os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")
logging.getLogger("chromadb.telemetry.product.posthog").setLevel(logging.CRITICAL)

STOPWORDS = set(
    "a an the and or of to in on for is are be at by with as it this that from my me i you your "
    "ang ng sa na at ba ko mo ka po yung mga para kung ano si ay may pa "
    # question words carry no topic, so they must not match documents on their own
    "what how why where when who which can do does much many should paano magkano saan bakit kailan ilan gaano".split()
)
MIN_BM25_SCORE = 1.0  # below this, a keyword match is treated as "not relevant"


@dataclass
class Hit:
    chunk_id: int
    title: str
    heading: str
    text: str
    score: float


# Tagalog/Taglish query words → English words used in the documents (keyword search only;
# vector search already understands these when the LLM is enabled)
QUERY_SYNONYMS = {
    "pamasahe": ["fare", "transport"], "jeep": ["jeepney"], "kuryente": ["electricity", "meralco"],
    "tubig": ["water"], "upa": ["rent"], "renta": ["rent"], "ipon": ["saving", "save"], "mag-ipon": ["saving"],
    "pagkain": ["food"], "kain": ["food", "meal"], "ulam": ["meal", "food"], "bigas": ["rice"], "kanin": ["rice"],
    "presyo": ["price", "cost"], "sahod": ["salary", "payday"], "baon": ["allowance", "student"],
    "utang": ["debt", "loan"], "gastos": ["spending", "expense"], "tipid": ["saving", "lower"],
}


def expand_query(tokens: list[str]) -> set[str]:
    out = set(tokens)
    for t in tokens:
        out.update(_stem(s) for s in QUERY_SYNONYMS.get(t, []))
    return out


def _stem(t: str) -> str:
    # very light English plural stemming: fares→fare, tips→tip (keeps "bus", "class")
    return t[:-1] if len(t) > 3 and t.endswith("s") and not t.endswith("ss") else t


def tokenize(text: str) -> list[str]:
    return [_stem(t) for t in re.findall(r"[a-zñ0-9/]+", text.lower()) if t not in STOPWORDS and len(t) > 1]


# ---------- Document loading & chunking ----------
def read_file(path: Path) -> str:
    if path.suffix.lower() == ".pdf":
        from pypdf import PdfReader

        return "\n\n".join(page.extract_text() or "" for page in PdfReader(str(path)).pages)
    return path.read_text(encoding="utf-8", errors="ignore")


def chunk_text(text: str, max_chars: int = 800) -> tuple[str, list[tuple[str, str]]]:
    """Returns (title, [(heading, chunk_text), ...])"""
    text = re.sub(r"^>.*$", "", text, flags=re.MULTILINE)  # drop editor notes / disclaimers
    title_match = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
    title = title_match.group(1).strip() if title_match else ""

    sections = re.split(r"^##\s+", text, flags=re.MULTILINE)
    chunks: list[tuple[str, str]] = []
    for i, section in enumerate(sections):
        if i == 0:
            heading, body = "Overview", re.sub(r"^#\s+.+$", "", section, flags=re.MULTILINE)
        else:
            heading, _, body = section.partition("\n")
        body = body.strip()
        if not body:
            continue
        buf = ""
        for para in re.split(r"\n\s*\n", body):
            if len(buf) + len(para) > max_chars and buf:
                chunks.append((heading.strip(), buf.strip()))
                buf = ""
            buf += para + "\n\n"
        if buf.strip():
            chunks.append((heading.strip(), buf.strip()))
    return title, chunks


class KnowledgeBase:
    def __init__(self):
        self._bm25: BM25Okapi | None = None
        self._chunks: list[KBChunk] = []
        self._collection = None
        self._openai = None

    # ---------- Vector store (optional) ----------
    def _vector_enabled(self) -> bool:
        if not settings.llm_enabled:
            return False
        if self._collection is not None:
            return True
        try:
            import chromadb
            from openai import OpenAI

            from chromadb.config import Settings as ChromaSettings

            client = chromadb.PersistentClient(
                path=str(settings.chroma_dir),
                settings=ChromaSettings(anonymized_telemetry=False),  # no usage data sent to Chroma
            )
            # One collection per embedding model: vectors from different models can't be mixed
            name = "kb_" + re.sub(r"[^a-zA-Z0-9]+", "_", settings.embed_model).strip("_")[:50]
            self._collection = client.get_or_create_collection(name, metadata={"hnsw:space": "cosine"})
            self._openai = OpenAI(api_key=settings.api_key, base_url=settings.base_url)
            return True
        except Exception as exc:  # vector search is an upgrade, never a hard requirement
            log.warning("Vector store disabled: %s", exc)
            return False

    def _embed(self, texts: list[str]) -> list[list[float]]:
        res = self._openai.embeddings.create(model=settings.embed_model, input=texts)
        return [d.embedding for d in res.data]

    # ---------- Indexing ----------
    def index_file(self, db: Session, path: Path) -> KBDocument:
        title, chunks = chunk_text(read_file(path))
        doc = db.scalar(select(KBDocument).where(KBDocument.filename == path.name))
        if doc:
            if self._vector_enabled():
                self._collection.delete(ids=[f"chunk-{c.id}" for c in doc.chunks] or ["none"])
            doc.chunks.clear()
        else:
            doc = KBDocument(filename=path.name, title="", file_type=path.suffix.lstrip(".").upper())
            db.add(doc)
        doc.title = title or path.stem.replace("_", " ").title()
        doc.status = "Indexed"
        doc.updated_at = datetime.now()
        doc.chunks = [KBChunk(position=i, heading=h[:200], text=t) for i, (h, t) in enumerate(chunks)]
        db.commit()

        if self._vector_enabled() and doc.chunks:
            self._embed_chunks(doc.chunks)
        self.rebuild(db)
        return doc

    def _embed_chunks(self, chunks: list[KBChunk]) -> int:
        """Embed chunks and store them in ChromaDB, 50 at a time. Returns how many were stored."""
        done = 0
        for i in range(0, len(chunks), 50):
            batch = chunks[i : i + 50]
            texts = [f"{c.document.title} — {c.heading}\n{c.text}" for c in batch]
            try:
                self._collection.upsert(
                    ids=[f"chunk-{c.id}" for c in batch],
                    embeddings=self._embed(texts),
                    documents=texts,
                    metadatas=[{"chunk_id": c.id} for c in batch],
                )
                done += len(batch)
            except Exception as exc:  # e.g. bad key, quota, model name — keyword search still works
                log.warning("Embedding failed (keyword search still works): %s", exc)
                break
        return done

    def ensure_vectors(self, db: Session) -> int:
        """Embed any chunks that have no vector yet (e.g. an API key was added after first start)."""
        if not self._vector_enabled():
            return 0
        chunks = list(db.scalars(select(KBChunk).join(KBDocument).order_by(KBChunk.id)))
        if not chunks:
            return 0
        existing = set(self._collection.get(ids=[f"chunk-{c.id}" for c in chunks])["ids"])
        missing = [c for c in chunks if f"chunk-{c.id}" not in existing]
        return self._embed_chunks(missing) if missing else 0

    def sync_folder(self, db: Session) -> int:
        """Index every file in knowledge_base/ that is new or changed since last indexing."""
        settings.kb_dir.mkdir(parents=True, exist_ok=True)
        count = 0
        for path in sorted(settings.kb_dir.iterdir()):
            if path.suffix.lower() not in (".md", ".txt", ".pdf"):
                continue
            doc = db.scalar(select(KBDocument).where(KBDocument.filename == path.name))
            modified = datetime.fromtimestamp(path.stat().st_mtime)
            if doc and doc.updated_at >= modified and doc.chunks:
                continue
            self.index_file(db, path)
            count += 1
        embedded = self.ensure_vectors(db)
        if embedded:
            log.info("Embedded %d chunk(s) for vector search (%s)", embedded, settings.embed_model)
        self.rebuild(db)
        return count

    def rebuild(self, db: Session):
        self._chunks = list(db.scalars(select(KBChunk).join(KBDocument).order_by(KBChunk.id)))
        corpus = [tokenize(f"{c.document.title} {c.heading} {c.text}") for c in self._chunks]
        self._token_sets = [set(toks) for toks in corpus]
        self._bm25 = BM25Okapi(corpus) if corpus else None

    def delete_document(self, db: Session, doc: KBDocument):
        if self._vector_enabled():
            self._collection.delete(ids=[f"chunk-{c.id}" for c in doc.chunks] or ["none"])
        path = settings.kb_dir / doc.filename
        if path.exists():
            path.unlink()
        db.delete(doc)
        db.commit()
        self.rebuild(db)

    # ---------- Retrieval ----------
    def search(self, query: str, k: int | None = None) -> list[Hit]:
        k = k or settings.rag_top_k
        if not self._chunks or not self._bm25:
            return []
        by_id = {c.id: c for c in self._chunks}

        # 1) Keyword (BM25). A chunk must share at least 2 query words (or all, for 1-word queries):
        #    one shared word like "tomorrow" or "cook" is not enough evidence of relevance.
        raw_tokens = tokenize(query)
        q_tokens = expand_query(raw_tokens)
        min_overlap = min(2, len(set(raw_tokens)))
        scores = self._bm25.get_scores(list(q_tokens))
        bm25_ranked = [
            self._chunks[i].id for i in sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
            if scores[i] >= MIN_BM25_SCORE and len(q_tokens & self._token_sets[i]) >= min_overlap
        ][: k * 3]

        # 2) Semantic (vector)
        vec_ranked: list[int] = []
        if self._vector_enabled():
            try:
                res = self._collection.query(query_embeddings=self._embed([query]), n_results=min(k * 3, len(self._chunks)))
                for meta, dist in zip(res["metadatas"][0], res["distances"][0]):
                    if dist <= settings.max_distance and meta["chunk_id"] in by_id:
                        vec_ranked.append(meta["chunk_id"])
            except Exception as exc:
                log.warning("Vector query failed, using keyword only: %s", exc)

        # 3) Reciprocal Rank Fusion
        fused: dict[int, float] = {}
        for ranked in (bm25_ranked, vec_ranked):
            for rank, cid in enumerate(ranked):
                fused[cid] = fused.get(cid, 0) + 1 / (60 + rank)

        best = sorted(fused.items(), key=lambda x: x[1], reverse=True)[:k]
        return [
            Hit(chunk_id=cid, title=by_id[cid].document.title, heading=by_id[cid].heading, text=by_id[cid].text, score=round(s, 4))
            for cid, s in best
        ]


kb = KnowledgeBase()
