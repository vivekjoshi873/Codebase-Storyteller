import env_config  # noqa: F401

import asyncio
import logging
import os
import re
from collections.abc import AsyncGenerator
from uuid import UUID

from openai import APIConnectionError, APIStatusError, AsyncOpenAI, RateLimitError

from chroma_store import get_chroma_store
from embedder import get_embedder

logger = logging.getLogger(__name__)

FILE_PATTERN = re.compile(r"\[FILE:\s*([^\]]+)\]")


def _sse(event: str, data: str) -> str:
    lines = data.splitlines() or [""]
    payload = "".join(f"data: {line}\n" for line in lines)
    return f"event: {event}\n{payload}\n"


def _retrieve_context(question: str, repo_id: UUID) -> tuple[str, list[dict]]:
    embedder = get_embedder()
    chroma_store = get_chroma_store()

    question_embedding = embedder.embed([question])[0]
    results = chroma_store.query(repo_id, question_embedding, n_results=5)

    context_blocks = []
    for item in results:
        filepath = item.get("filepath", "unknown")
        content = item.get("content", "")
        context_blocks.append(f"### {filepath}\n{content}")

    context_text = "\n\n".join(context_blocks) if context_blocks else "No context found."
    return context_text, results


def _openai_error_message(exc: Exception) -> str:
    if isinstance(exc, RateLimitError):
        return (
            "OpenAI rate limit or quota exceeded. Check billing at "
            "https://platform.openai.com/account/billing and set a valid OPENAI_API_KEY in .env."
        )
    if isinstance(exc, APIStatusError):
        return f"OpenAI API error ({exc.status_code}): {exc.message}"
    if isinstance(exc, APIConnectionError):
        return "Could not reach OpenAI. Check your network connection and API key."
    return f"Query failed: {exc}"


async def stream_answer(question: str, repo_id: UUID) -> AsyncGenerator[str, None]:
    yield _sse("message", "Searching codebase…")

    try:
        context_text, _results = await asyncio.to_thread(
            _retrieve_context, question, repo_id
        )
    except Exception as exc:
        logger.exception("RAG retrieval failed for repo %s", repo_id)
        yield _sse("error", f"Could not search codebase: {exc}")
        yield _sse("done", "")
        return

    if not os.getenv("OPENAI_API_KEY"):
        yield _sse(
            "error",
            "OPENAI_API_KEY is not set. Add it to your .env file and restart the backend.",
        )
        yield _sse("done", "")
        return

    yield _sse("message", "\n\n")

    system_prompt = (
        "You are a codebase expert. Answer using only the provided code context. "
        "When you mention a file, include it in your response as [FILE: filepath] "
        "so the frontend can highlight it."
    )
    user_prompt = f"Context:\n{context_text}\n\nQuestion: {question}"

    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    client = AsyncOpenAI(
        api_key=os.getenv("OPENAI_API_KEY"),
        max_retries=0,
        timeout=60.0,
    )
    file_buffer = ""
    highlighted: set[str] = set()

    try:
        stream = await client.chat.completions.create(
            model=model,
            stream=True,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )

        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if not delta:
                continue

            yield _sse("message", delta)

            file_buffer = (file_buffer + delta)[-256:]
            for match in FILE_PATTERN.finditer(file_buffer):
                filepath = match.group(1).strip()
                if filepath not in highlighted:
                    highlighted.add(filepath)
                    yield _sse("highlight", filepath)

    except Exception as exc:
        logger.exception("OpenAI streaming failed")
        yield _sse("error", _openai_error_message(exc))

    yield _sse("done", "")
