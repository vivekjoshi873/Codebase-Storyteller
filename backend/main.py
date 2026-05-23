import asyncio
import json
import logging
import traceback
from uuid import UUID

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal, Base, engine, get_db
from embedder import preload_embedder
from ingest import ingest_repo
from models import Chunk, Repo
from query import stream_answer
from schemas import IngestRequest, IngestResponse, RepoStatusResponse

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Codebase Storyteller")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def debug_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        raise exc
    logger.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "error": str(exc),
            "detail": traceback.format_exc(),
        },
    )


def _repo_name_from_url(url: str) -> str:
    cleaned = url.rstrip("/").replace(".git", "")
    parts = cleaned.split("/")
    if len(parts) >= 2:
        return f"{parts[-2]}/{parts[-1]}"
    return parts[-1] if parts else url


def _parse_graph(graph_json: str | None) -> dict:
    if not graph_json:
        return {"nodes": [], "edges": []}
    try:
        return json.loads(graph_json)
    except json.JSONDecodeError:
        logger.warning("Invalid graph JSON found in database")
        return {"nodes": [], "edges": []}


async def _run_ingest_job(repo_id: UUID, repo_url: str) -> None:
    async with AsyncSessionLocal() as db:
        repo = await db.get(Repo, repo_id)
        if repo is None:
            logger.warning("Skipping ingest for missing repo %s", repo_id)
            return

        try:
            graph, chunks = await ingest_repo(repo_url, repo_id)

            db.add_all(
                [
                    Chunk(
                        repo_id=repo_id,
                        filepath=chunk["filepath"],
                        content=chunk["content"],
                        chunk_index=chunk["chunk_index"],
                    )
                    for chunk in chunks
                ]
            )

            repo.status = "done"
            repo.graph_json = json.dumps(graph)
            await db.commit()
        except Exception as exc:
            logger.exception("Ingest failed for %s", repo_url)
            repo.status = "failed"
            repo.graph_json = json.dumps({"error": str(exc)})
            await db.commit()


@app.on_event("startup")
async def startup() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Preloading embedding model in background...")
    await asyncio.to_thread(preload_embedder)
    logger.info("Backend ready. POST /api/ingest to analyse a repo.")


@app.post("/api/ingest", response_model=IngestResponse)
async def api_ingest(
    body: IngestRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    repo_url = body.url.strip()
    cached_result = await db.execute(
        select(Repo)
        .where(Repo.url == repo_url, Repo.status.in_(["processing", "done"]))
        .order_by(desc(Repo.created_at))
        .limit(1)
    )
    cached_repo = cached_result.scalar_one_or_none()

    if cached_repo is not None:
        return IngestResponse(
            repo_id=cached_repo.id,
            status=cached_repo.status,
            graph=_parse_graph(cached_repo.graph_json),
        )

    repo = Repo(
        url=repo_url,
        name=_repo_name_from_url(repo_url),
        status="processing",
    )
    db.add(repo)
    await db.commit()
    await db.refresh(repo)
    background_tasks.add_task(_run_ingest_job, repo.id, repo_url)

    return IngestResponse(
        repo_id=repo.id,
        status=repo.status,
        graph={"nodes": [], "edges": []},
    )


@app.get("/api/repo/{repo_id}", response_model=RepoStatusResponse)
async def api_repo_status(repo_id: UUID, db: AsyncSession = Depends(get_db)):
    repo = await db.get(Repo, repo_id)
    if repo is None:
        raise HTTPException(status_code=404, detail="Repository not found")

    graph = _parse_graph(repo.graph_json)
    error = graph.get("error") if repo.status == "failed" else None
    return RepoStatusResponse(
        repo_id=repo.id,
        status=repo.status,
        graph=graph if repo.status == "done" else {"nodes": [], "edges": []},
        error=error,
    )


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
