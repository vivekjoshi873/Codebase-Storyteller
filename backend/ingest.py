import os
import tempfile
from uuid import UUID

from fastapi import HTTPException
from git import Repo
from git.exc import GitCommandError

from chroma_store import get_chroma_store
from embedder import get_embedder
from graph_builder import build_graph

CHUNK_SIZE = 50
CODE_EXTENSIONS = (".py", ".ts", ".tsx")


def _chunk_file(filepath: str, content: str) -> list[dict]:
    lines = content.splitlines()
    if not lines:
        return []

    chunks: list[dict] = []
    for index, start in enumerate(range(0, len(lines), CHUNK_SIZE)):
        block = lines[start : start + CHUNK_SIZE]
        chunks.append(
            {
                "filepath": filepath,
                "content": "\n".join(block),
                "chunk_index": index,
            }
        )
    return chunks


def _collect_chunks(repo_path: str) -> list[dict]:
    all_chunks: list[dict] = []
    for root, _, files in os.walk(repo_path):
        if ".git" in root.split(os.sep):
            continue
        for filename in files:
            if not filename.endswith(CODE_EXTENSIONS):
                continue
            full_path = os.path.join(root, filename)
            rel_path = os.path.relpath(full_path, repo_path).replace("\\", "/")
            try:
                content = open(full_path, encoding="utf-8", errors="ignore").read()
            except OSError:
                continue
            all_chunks.extend(_chunk_file(rel_path, content))
    return all_chunks


async def ingest_repo(repo_url: str, repo_id: UUID) -> dict:
    embedder = get_embedder()
    chroma_store = get_chroma_store()

    with tempfile.TemporaryDirectory(prefix="storyteller_") as tmp_dir:
        try:
            Repo.clone_from(repo_url, tmp_dir, depth=1)
        except GitCommandError as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to clone repository: {exc}",
            ) from exc

        graph = build_graph(tmp_dir)
        chunks = _collect_chunks(tmp_dir)

        if chunks:
            embeddings = embedder.embed([chunk["content"] for chunk in chunks])
            chroma_store.add_chunks(repo_id, chunks, embeddings)

        return graph, chunks
