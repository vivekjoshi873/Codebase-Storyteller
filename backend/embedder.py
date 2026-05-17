from sentence_transformers import SentenceTransformer


class Embedder:
    def __init__(self) -> None:
        self._model = SentenceTransformer("all-MiniLM-L6-v2")

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        vectors = self._model.encode(texts, show_progress_bar=False)
        return [vector.tolist() for vector in vectors]


_embedder: Embedder | None = None


def get_embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        _embedder = Embedder()
    return _embedder
