import logging
import os

from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

EMBED_BATCH_SIZE = 64


class Embedder:
    def __init__(self) -> None:
        model_name = os.getenv("EMBED_MODEL", "all-MiniLM-L6-v2")
        logger.info("Loading embedding model: %s (first run may download ~90MB)", model_name)
        self._model = SentenceTransformer(model_name)
        logger.info("Embedding model ready.")

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        all_vectors: list[list[float]] = []
        total = len(texts)
        for start in range(0, total, EMBED_BATCH_SIZE):
            batch = texts[start : start + EMBED_BATCH_SIZE]
            vectors = self._model.encode(batch, show_progress_bar=False)
            all_vectors.extend(vector.tolist() for vector in vectors)
            logger.info(
                "Embedded %s/%s chunks",
                min(start + EMBED_BATCH_SIZE, total),
                total,
            )
        return all_vectors


_embedder: Embedder | None = None


def get_embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        _embedder = Embedder()
    return _embedder


def preload_embedder() -> None:
    """Load the model once at startup so the first /api/ingest is faster."""
    get_embedder()
