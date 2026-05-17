import json
from uuid import UUID

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import Base, engine, get_db
from ingest import ingest_repo
from models import Chunk, Repo
from query import stream_answer
from schemas import IngestRequest, IngestResponse

load_dotenv()

app = FastAPI(title="Codebase Storyteller")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _repo_name_from_url(url: str) -> str:
    cleaned = url.rstrip("/").replace(".git", "")
    parts = cleaned.split("/")
    if len(parts) >= 2:
        return f"{parts[-2]}/{parts[-1]}"
    return parts[-1] if parts else url


@app.on_event("startup")
async def startup() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


@app.post("/api/ingest", response_model=IngestResponse)
async def api_ingest(body: IngestRequest, db: AsyncSession = Depends(get_db)):
    repo = Repo(
        url=body.url,
        name=_repo_name_from_url(body.url),
        status="processing",
    )
    db.add(repo)
    await db.commit()
    await db.refresh(repo)

    try:
        graph, chunks = await ingest_repo(body.url, repo.id)

        for chunk in chunks:
            db.add(
                Chunk(
                    repo_id=repo.id,
                    filepath=chunk["filepath"],
                    content=chunk["content"],
                    chunk_index=chunk["chunk_index"],
                )
            )

        repo.status = "done"
        repo.graph_json = json.dumps(graph)
        await db.commit()
    except HTTPException:
        repo.status = "failed"
        await db.commit()
        raise
    except Exception as exc:
        repo.status = "failed"
        await db.commit()
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return IngestResponse(repo_id=repo.id, status=repo.status, graph=graph)


@app.get("/api/query")
async def api_query(
    q: str = Query(..., min_length=1),
    repo_id: UUID = Query(...),
):
    return StreamingResponse(
        stream_answer(q, repo_id),
        media_type="text/event-stream",
    )


@app.get("/api/file", response_class=PlainTextResponse)
async def api_file(
    repo_id: UUID = Query(...),
    filepath: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Chunk)
        .where(Chunk.repo_id == repo_id, Chunk.filepath == filepath)
        .order_by(Chunk.chunk_index)
    )
    chunks = result.scalars().all()

    if not chunks:
        raise HTTPException(status_code=404, detail="File not found for this repository")

    return "\n".join(chunk.content for chunk in chunks)
