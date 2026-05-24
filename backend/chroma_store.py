import env_config  # noqa: F401

import os
from hashlib import sha1
from pathlib import Path
from uuid import UUID

import chromadb

BACKEND_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = env_config.PROJECT_ROOT


def _resolve_persist_dir() -> str:
    persist_dir = Path(os.getenv("CHROMA_PERSIST_DIR", "./chroma_data"))
    if not persist_dir.is_absolute():
        persist_dir = BACKEND_ROOT / persist_dir
    persist_dir.mkdir(parents=True, exist_ok=True)
    return str(persist_dir)


def _chunk_batches(
    ids: list[str],
    embeddings: list[list[float]],
    documents: list[str],
    metadatas: list[dict],
    batch_size: int,
):
    for start in range(0, len(ids), batch_size):
        end = start + batch_size
        yield (
            ids[start:end],
            embeddings[start:end],
            documents[start:end],
            metadatas[start:end],
        )


class ChromaStore:
    def __init__(self) -> None:
        persist_dir = _resolve_persist_dir()
        self._client = chromadb.PersistentClient(path=persist_dir)
        self._collection = self._client.get_or_create_collection(
            name="code_chunks",
            metadata={"hnsw:space": "cosine"},
        )
        self._max_batch_size = getattr(self._client, "get_max_batch_size", lambda: 5000)()

    def add_chunks(
        self,
        repo_id: UUID,
        chunks: list[dict],
        embeddings: list[list[float]],
    ) -> None:
        if not chunks:
            return

        repo_id_str = str(repo_id)
        ids: list[str] = []
        documents: list[str] = []
        metadatas: list[dict] = []

        for chunk in chunks:
            filepath = chunk["filepath"]
            chunk_index = chunk["chunk_index"]
            path_hash = sha1(filepath.encode("utf-8")).hexdigest()
            chunk_id = f"{repo_id_str}_{path_hash}_{chunk_index}"
            ids.append(chunk_id)
            documents.append(chunk["content"])
            metadatas.append(
                {
                    "filepath": filepath,
                    "repo_id": repo_id_str,
                    "chunk_index": str(chunk_index),
                }
            )

        try:
            self._collection.delete(where={"repo_id": repo_id_str})
        except Exception:
            pass

        for batch_ids, batch_embeddings, batch_documents, batch_metadatas in _chunk_batches(
            ids,
            embeddings,
            documents,
            metadatas,
            self._max_batch_size,
        ):
            self._collection.add(
                ids=batch_ids,
                embeddings=batch_embeddings,
                documents=batch_documents,
                metadatas=batch_metadatas,
            )

    def query(
        self, repo_id: UUID, query_embedding: list[float], n_results: int = 5
    ) -> list[dict]:
        results = self._collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            where={"repo_id": str(repo_id)},
        )

        documents = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]

        output: list[dict] = []
        for index, document in enumerate(documents):
            metadata = metadatas[index] if index < len(metadatas) else {}
            output.append(
                {
                    "content": document,
                    "filepath": metadata.get("filepath", ""),
                    "chunk_index": metadata.get("chunk_index", "0"),
                }
            )
        return output


_chroma_store: ChromaStore | None = None


def get_chroma_store() -> ChromaStore:
    global _chroma_store
    if _chroma_store is None:
        _chroma_store = ChromaStore()
    return _chroma_store
