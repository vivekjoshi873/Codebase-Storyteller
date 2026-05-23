import asyncio
import logging
import os
import tempfile
from uuid import UUID

from fastapi import HTTPException
from git import Repo
from git.exc import GitCommandError

from chroma_store import get_chroma_store
from embedder import get_embedder
from graph_builder import build_graph

logger = logging.getLogger(__name__)

CHUNK_SIZE = 50
CODE_EXTENSIONS = (".py", ".ts", ".tsx")
SKIP_DIRS = {
    ".git",
    ".hg",
    ".mypy_cache",
    ".next",
    ".pytest_cache",
    ".ruff_cache",
    ".tox",
    ".venv",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "site-packages",
    "vendor",
    "venv",
}


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
    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [dirname for dirname in dirs if dirname not in SKIP_DIRS]
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


def _clone_repo(repo_url: str, tmp_dir: str) -> None:
    try:
        Repo.clone_from(repo_url, tmp_dir, depth=1)
    except GitCommandError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to clone repository: {exc}",
        ) from exc


def _embed_and_store(repo_id: UUID, chunks: list[dict]) -> None:
    if not chunks:
        return

    embedder = get_embedder()
    chroma_store = get_chroma_store()
    embeddings = embedder.embed([chunk["content"] for chunk in chunks])
    chroma_store.add_chunks(repo_id, chunks, embeddings)


async def ingest_repo(repo_url: str, repo_id: UUID) -> tuple[dict, list[dict]]:
    with tempfile.TemporaryDirectory(prefix="storyteller_") as tmp_dir:
        logger.info("Cloning %s", repo_url)
        await asyncio.to_thread(_clone_repo, repo_url, tmp_dir)

        logger.info("Building dependency graph")
        graph = await asyncio.to_thread(build_graph, tmp_dir)
        chunks = await asyncio.to_thread(_collect_chunks, tmp_dir)
        logger.info("Collected %s code chunks", len(chunks))

        logger.info("Embedding and storing in ChromaDB (this can take 1-3 min on CPU)")
        await asyncio.to_thread(_embed_and_store, repo_id, chunks)

        logger.info(
            "Ingest complete: %s nodes, %s edges",
            len(graph.get("nodes", [])),
            len(graph.get("edges", [])),
        )
        return graph, chunks
