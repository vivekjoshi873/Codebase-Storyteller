import os

from dotenv import load_dotenv
import re
from collections.abc import AsyncGenerator
from uuid import UUID

from openai import AsyncOpenAI

load_dotenv()

from chroma_store import get_chroma_store
from embedder import get_embedder

FILE_PATTERN = re.compile(r"\[FILE:\s*([^\]]+)\]")


async def stream_answer(question: str, repo_id: UUID) -> AsyncGenerator[str, None]:
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

    system_prompt = (
        "You are a codebase expert. Answer using only the provided code context. "
        "When you mention a file, include it in your response as [FILE: filepath] "
        "so the frontend can highlight it."
    )
    user_prompt = f"Context:\n{context_text}\n\nQuestion: {question}"

    client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    stream = await client.chat.completions.create(
        model="gpt-4o",
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

        yield f"data: {delta}\n\n"

        for match in FILE_PATTERN.finditer(delta):
            filepath = match.group(1).strip()
            yield f"event: highlight\ndata: {filepath}\n\n"
