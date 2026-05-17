# Codebase Storyteller — Agent Guide

> **Read this file at the start of every session.**  
> This document is the single source of truth for architecture, conventions, and constraints.  
> Do not ask the user clarifying questions that are already answered here.

---

## Table of Contents

1. [Project Identity](#project-identity)
2. [Agent Behaviour Rules](#agent-behaviour-rules)
3. [Architecture Overview](#architecture-overview)
4. [Folder Structure](#folder-structure)
5. [Environment Variables](#environment-variables)
6. [Stack Reference](#stack-reference)
7. [Data Models](#data-models)
8. [API Routes](#api-routes)
9. [Frontend State Shape](#frontend-state-shape)
10. [Common Tasks](#common-tasks)
11. [Known Issues and Constraints](#known-issues-and-constraints)
12. [Git Conventions](#git-conventions)
13. [Performance Notes](#performance-notes)

---

## Project Identity

| Field | Value |
|-------|-------|
| **Project name** | Codebase Storyteller |
| **One-line description** | An AI-powered web app that turns any GitHub repository into an interactive, narrated visual dependency graph. |
| **Version** | 0.1.0 |
| **Status** | Active development |
| **Primary language** | Python (backend), JavaScript (frontend) |
| **License** | MIT |

---

## Agent Behaviour Rules

The agent must follow these rules in every session:

1. Never delete or overwrite a file without first reading its current contents and stating what you are about to change and why.

2. Never install a new package without adding it to `requirements.txt` (backend) or `package.json` (frontend) in the same response.

3. Always run type-safe code. Backend uses Python type hints on every function signature. Frontend uses JSDoc comments on every component.

4. Never hardcode secrets, API keys, or database URLs. Always read from environment variables via `python-dotenv` on the backend and `import.meta.env` on the frontend.

5. When editing an existing file, show the full file after edits — never show only the diff. Partial files cause the agent to lose context.

6. Before writing any new feature, state: what file it goes in, what function/component it adds, and what it connects to.

7. If a task spans more than one file, list all affected files first, then edit them in dependency order (models before routes, store before components).

8. Never use any CSS framework (no Tailwind, no Bootstrap). Write plain CSS in a dedicated `.css` file per component or in `App.css`.

9. Always handle errors explicitly. Every async function must have a `try/except` (Python) or `try/catch` (JS). Never use bare `except`.

10. When the user says "fix this", read the error message fully before writing any code. State the root cause in one sentence first.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (React 18 + Vite)                                      │
│  - GraphPanel (D3 force graph)                                  │
│  - ChatPanel (EventSource SSE)                                  │
│  - MonacoPanel (code viewer)                                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP POST /api/ingest
                            │ HTTP GET  /api/file
                            │ SSE GET   /api/query
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  FastAPI backend (port 8000)                                    │
│  main.py · ingest.py · query.py · graph_builder.py              │
└───────┬─────────────────────────────┬───────────────────────────┘
        │ SQLAlchemy async (asyncpg)  │ ChromaDB PersistentClient
        ▼                             ▼
┌───────────────────┐       ┌─────────────────────────────────────┐
│ PostgreSQL        │       │ ChromaDB (disk: CHROMA_PERSIST_DIR) │
│ port 5432         │       │ collection: "code_chunks"           │
│ repos · chunks    │       │ vectors + metadata                  │
└───────────────────┘       └──────────────────┬──────────────────┘
                                               │
                                               │ embed query vector
                                               ▼
                                    ┌─────────────────────┐
                                    │ OpenAI API (gpt-4o) │
                                    │ streaming completion│
                                    └──────────┬──────────┘
                                               │ SSE tokens + [FILE: …]
                                               ▼
                                    Browser (ChatPanel + GraphPanel)
```

**Data flow (end-to-end):** The user pastes a GitHub URL in the browser and clicks **Analyse**, which sends `POST /api/ingest`. The backend clones the repository into a temporary directory with GitPython, walks all `.py` and `.ts`/`.tsx` files, and uses AST/regex parsing in `graph_builder.py` to produce a dependency graph of files and import edges. Each file is split into ~50-line chunks; `embedder.py` converts every chunk into a 384-dimensional vector with `all-MiniLM-L6-v2`, and `chroma_store.py` persists those vectors in ChromaDB while PostgreSQL stores repo metadata, the serialized graph JSON, and the raw chunk text for file retrieval. When the user asks a question, `GET /api/query` embeds the question, retrieves the top five similar chunks from ChromaDB filtered by `repo_id`, builds a RAG prompt, and streams `gpt-4o` tokens back to the browser as Server-Sent Events; `[FILE: filepath]` patterns in the stream trigger graph node highlights while tokens append to the chat panel.

---

## Folder Structure

```
codebase-storyteller/
├── AGENT.md
├── README.md
├── docker-compose.yml
├── .env.example
├── .gitignore
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py            # FastAPI app, routes, startup
│   ├── database.py        # SQLAlchemy engine, session, Base
│   ├── models.py          # ORM models: Repo, Chunk
│   ├── schemas.py         # Pydantic request/response schemas
│   ├── ingest.py          # Clone → parse → chunk → embed → store
│   ├── embedder.py        # SentenceTransformer singleton
│   ├── graph_builder.py   # AST + regex → nodes/edges dict
│   ├── chroma_store.py    # ChromaDB add + query wrapper
│   └── query.py           # RAG pipeline + SSE stream generator
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── App.css
        ├── store.js             # Zustand global state
        └── components/
            ├── GraphPanel.jsx   # D3 force graph
            ├── GraphPanel.css
            ├── ChatPanel.jsx    # SSE streaming chat
            ├── ChatPanel.css
            ├── MonacoPanel.jsx  # Monaco code viewer
            └── MonacoPanel.css
```

### File responsibilities

| File | Responsibility |
|------|----------------|
| `AGENT.md` | Canonical guide for AI coding agents working on this repository. |
| `README.md` | Human-facing setup, run commands, and quick-start instructions. |
| `docker-compose.yml` | Orchestrates `db`, `backend`, and `frontend` services with healthchecks and volumes. |
| `.env.example` | Template for all required and optional environment variables. |
| `.gitignore` | Excludes secrets, virtualenvs, `node_modules`, Chroma data, and build artifacts. |
| `backend/Dockerfile` | Builds the Python 3.11 image with `git` and runs `uvicorn` on port 8000. |
| `backend/requirements.txt` | Pinned Python dependencies; every new backend package must be listed here. |
| `backend/main.py` | FastAPI application: CORS, startup table creation (dev), and all HTTP routes. |
| `backend/database.py` | Async SQLAlchemy engine, `AsyncSessionLocal`, `Base`, and `get_db()` dependency. |
| `backend/models.py` | SQLAlchemy ORM definitions for `Repo` and `Chunk` tables. |
| `backend/schemas.py` | Pydantic v2 models for request validation and response serialization. |
| `backend/ingest.py` | Full ingest pipeline: clone repo, build graph, chunk files, embed, write to ChromaDB and return chunks for Postgres. |
| `backend/embedder.py` | Singleton `SentenceTransformer` wrapper; sole entry point for text→vector conversion. |
| `backend/graph_builder.py` | Walks repo files; extracts Python imports via AST and TypeScript imports via regex; returns deduplicated graph dict. |
| `backend/chroma_store.py` | Wraps ChromaDB persistent client: `add_chunks`, `query`, and per-repo deletion before re-index. |
| `backend/query.py` | RAG retrieval + OpenAI streaming; emits SSE `message` and `highlight` events. |
| `frontend/Dockerfile` | Node 20 Alpine image; installs npm deps and runs Vite dev server on port 5173. |
| `frontend/package.json` | Frontend dependencies and `dev`/`build` scripts. |
| `frontend/vite.config.js` | Vite + React plugin; proxies `/api` to the backend service. |
| `frontend/index.html` | HTML shell with `#root` mount point. |
| `frontend/src/main.jsx` | React 18 entry: mounts `<App />` and imports global styles. |
| `frontend/src/App.jsx` | Top-level layout: URL input, Analyse button, three-panel grid. |
| `frontend/src/App.css` | Global layout styles: grid, top bar, shared tokens (colors, spacing). |
| `frontend/src/store.js` | Zustand store: repo ID, graph, chat messages, selection, and highlight state. |
| `frontend/src/components/GraphPanel.jsx` | D3 force-directed graph; node click selects file; reacts to `activeNodes`. |
| `frontend/src/components/GraphPanel.css` | SVG container sizing and node pulse animation styles. |
| `frontend/src/components/ChatPanel.jsx` | Question input, message list, EventSource connection to `/api/query`. |
| `frontend/src/components/ChatPanel.css` | Chat bubble layout, user/assistant alignment, input row styles. |
| `frontend/src/components/MonacoPanel.jsx` | Fetches `/api/file` when `selectedFile` changes; renders Monaco read-only. |
| `frontend/src/components/MonacoPanel.css` | Editor container height and empty-state placeholder styles. |

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | yes | none | Async SQLAlchemy connection string (`postgresql+asyncpg://user:pass@host:5432/dbname`) |
| `POSTGRES_USER` | yes | none | PostgreSQL username (used by Docker `db` service) |
| `POSTGRES_PASSWORD` | yes | none | PostgreSQL password |
| `POSTGRES_DB` | yes | `codebase` | PostgreSQL database name |
| `OPENAI_API_KEY` | yes | none | OpenAI secret key for `gpt-4o` streaming in `query.py` |
| `CHROMA_PERSIST_DIR` | no | `./chroma_data` | Filesystem path for ChromaDB persistent storage |
| `EMBED_MODEL` | no | `all-MiniLM-L6-v2` | Sentence-transformers model name loaded by `embedder.py` |

**Rule:** The agent must never read from `os.environ` directly without loading dotenv first. Always use:

```python
from dotenv import load_dotenv
load_dotenv()
```

then `os.getenv("KEY")` with a sensible default where appropriate.

On the frontend, use `import.meta.env.VITE_*` only for values that are safe to expose to the browser (never API keys).

---

## Stack Reference

### Backend

| Library | Version / notes | Use for | Never use for |
|---------|-----------------|---------|---------------|
| **Python 3.11** | Runtime in Docker and local dev | All backend code | — |
| **FastAPI** | Async web framework | HTTP routes, dependency injection, SSE `StreamingResponse` | Sync WSGI patterns, Flask |
| **SQLAlchemy 2.0 async** | ORM | `Repo`/`Chunk` models, async sessions in routes | Raw SQL strings without parameterization |
| **asyncpg** | Driver | PostgreSQL connectivity via SQLAlchemy async URL | Direct asyncpg queries outside SQLAlchemy |
| **Alembic** | Migrations | Schema changes in production (`alembic upgrade head`) | Ad-hoc `ALTER TABLE` without a revision |
| **GitPython** | `git` CLI wrapper | Cloning repos inside `ingest.py` temp directories | Long-term repo storage on disk |
| **ChromaDB** | Vector DB | Similarity search over code chunk embeddings | Relational metadata or full-file storage |
| **sentence-transformers** | Embedding model | Chunk and query vectorization via `embedder.py` singleton | LLM text generation |
| **openai** | Official SDK | Async streaming chat completions in `query.py` | Embedding generation (use sentence-transformers) |
| **pydantic v2** | Validation | Request/response schemas in `schemas.py` | ORM model definitions (use SQLAlchemy) |
| **python-dotenv** | Config | Loading `.env` at process start | Committing secrets to git |
| **httpx** | HTTP client | Optional outbound HTTP if added later | Replacing OpenAI SDK for LLM calls |

### Frontend

| Library | Use for | Never use for |
|---------|---------|---------------|
| **React 18** | Component tree, hooks, UI state local to a single component | Global app state (use Zustand) |
| **Vite** | Dev server, HMR, production bundling, `/api` proxy to backend | Backend API implementation |
| **D3.js v7** | Force simulation, SVG nodes/edges in `GraphPanel.jsx` | React component rendering without `useEffect` cleanup |
| **@monaco-editor/react** | Read-only syntax-highlighted code in `MonacoPanel.jsx` | Dependency graph layout |
| **Zustand** | Global state in `store.js` | Server-side data persistence |
| **Plain CSS** | All styling in `App.css` and per-component `.css` files | Tailwind, Bootstrap, styled-components, CSS-in-JS libraries |

### Infrastructure

| Component | Use for | Never use for |
|-----------|---------|---------------|
| **Docker Compose** | Local full-stack: `db`, `backend`, `frontend` | Production orchestration without additional hardening |
| **PostgreSQL 16 Alpine** | Repo metadata, chunk text, serialized graph JSON | Vector similarity search |
| **ChromaDB persistent client** | Embedding storage and RAG retrieval | Transactional relational data |
| **Docker volume `chroma_data`** | Persist vectors across container restarts | Storing cloned git repos (repos are ephemeral) |
| **Docker volume `pgdata`** | Persist Postgres data | Application logs |

---

## Data Models

### PostgreSQL (SQLAlchemy ORM)

#### `repos` table (`Repo` model)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | primary key, default `uuid4` | Unique repository record identifier |
| `url` | String(500) | not null | Full GitHub URL submitted by the user |
| `name` | String(200) | not null | Human-readable `"owner/repo"` derived from URL |
| `status` | String(20) | not null | One of: `pending`, `processing`, `done`, `failed` |
| `graph_json` | Text | nullable | JSON-serialized `{nodes, edges}` dependency graph |
| `created_at` | DateTime | default `utcnow` | Timestamp when ingest was initiated |

#### `chunks` table (`Chunk` model)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | primary key, default `uuid4` | Unique chunk row identifier |
| `repo_id` | UUID | FK → `repos.id`, `ON DELETE CASCADE` | Parent repository |
| `filepath` | String(500) | not null | Repo-relative path (e.g. `src/main.py`) |
| `content` | Text | not null | Raw text of this ~50-line chunk |
| `chunk_index` | Integer | not null | Zero-based index of chunk within the file |

**Recommended index (add via Alembic):** composite index on `(repo_id, filepath)` for fast `/api/file` lookups.

### ChromaDB collection `code_chunks`

| Field | Type | Description |
|-------|------|-------------|
| **Document** | string | Chunk content text (same as Postgres `chunks.content`) |
| **Embedding** | `float[]` | 384 dimensions from `all-MiniLM-L6-v2` |
| **Metadata** | `{repo_id: str, filepath: str, chunk_index: int}` | All metadata values stored as strings in Chroma; cast `chunk_index` to int when reading |
| **ID** | string | `"{repo_id}_{filepath}_{chunk_index}"` — filepath slashes may be replaced with `__` to satisfy Chroma ID constraints |

**Rules:**

- The agent must never change column names or types without running an Alembic migration.
- Never use `Base.metadata.create_all` in production; it is acceptable only for local v0.1 development bootstrap in `main.py` startup.

---

## API Routes

| Method | Path | Input | Output | Description |
|--------|------|-------|--------|-------------|
| `POST` | `/api/ingest` | JSON `{ "url": string }` | `{ "repo_id": UUID, "status": string, "graph": { nodes, edges } }` | Clone repo, parse imports, chunk, embed, store in ChromaDB + Postgres; return graph |
| `GET` | `/api/query` | Query: `q` (string), `repo_id` (UUID) | `text/event-stream` (SSE) | Embed question, RAG top-5, stream `gpt-4o` answer |
| `GET` | `/api/file` | Query: `repo_id` (UUID), `filepath` (string) | `text/plain` | Join all chunks for filepath ordered by `chunk_index` |
| `GET` | `/api/repo/{id}` | Path: `id` (UUID) | `{ "id", "url", "name", "status" }` | Return repo metadata without re-ingesting |

### SSE contract (`GET /api/query`)

The agent **must always** emit exactly these two custom event types (in addition to optional connection keep-alives):

| Event name | Payload (`data:` field) | When to emit |
|------------|-------------------------|--------------|
| `message` | Single LLM token string (plain text, not JSON) | Every streamed token from OpenAI |
| `highlight` | Filepath string (repo-relative, matches graph node `id`) | Whenever `[FILE: filepath]` appears in model output |

**Wire format examples:**

```
event: message
data: The

event: message
data: main

event: highlight
data: src/app.py

```

**Frontend handling (`ChatPanel.jsx`):**

```javascript
source.addEventListener("message", (e) => updateLastMessage(e.data));
source.addEventListener("highlight", (e) => setActiveNodes([e.data]));
```

The agent must **not** emit tokens as untyped default SSE events if implementing or fixing `query.py`; use `event: message` explicitly so the frontend contract stays stable.

---

## Frontend State Shape

The Zustand store in `frontend/src/store.js` must conform to this interface. **Do not change field names or action signatures without updating this section first.**

```typescript
// store.js — canonical shape
{
  repoId:         string | null,
  graphData:      { nodes: Node[], edges: Edge[] },
  activeNodes:    string[],
  selectedFile:   string | null,
  chatMessages:   Message[],

  setRepoId:         (id: string) => void,
  setGraphData:      (data: GraphData) => void,
  setActiveNodes:    (nodes: string[]) => void,
  setSelectedFile:   (file: string) => void,
  appendMessage:     (msg: Message) => void,
  updateLastMessage: (token: string) => void,
}
```

**Types:**

```typescript
type Node = { id: string; label: string };
type Edge = { from: string; to: string };
type Message = { role: "user" | "assistant"; text: string };
type GraphData = { nodes: Node[]; edges: Edge[] };
```

**Rules:**

- The agent must never add new fields to the store without listing them here first.
- Components read from the store — they never write local state that duplicates store state (except transient UI like input field text before submit).
- `repoId` is set by `App.jsx` after a successful `POST /api/ingest`.
- `activeNodes` holds filepath strings that match `Node.id` in the graph.
- `updateLastMessage` appends a token to the **last** message in `chatMessages` (must be role `assistant`).

---

## Common Tasks

### Adding a new API route

1. Add Pydantic request/response models to `backend/schemas.py`.
2. Add the route handler function to `backend/main.py` with type hints and explicit error handling.
3. If the route needs database access, use `db: AsyncSession = Depends(get_db)`; add query helpers in a dedicated module if logic exceeds ~30 lines.
4. Update the **API Routes** table in this file (`AGENT.md`).
5. Test locally:
   ```bash
   curl -X POST http://localhost:8000/api/your-route \
     -H "Content-Type: application/json" \
     -d '{"key": "value"}'
   ```

### Adding a new frontend component

1. Create `src/components/ComponentName.jsx` with a JSDoc block describing props (if any) and store usage.
2. Create `src/components/ComponentName.css` in the same folder; import it at the top of the JSX file.
3. Import and render the component in `App.jsx` (or a parent component).
4. If it needs global state, import `useStore` from `../store.js` and select only the slices needed.
5. Never pass store values as props from parent to child when the child could read the store directly.
6. Do **not** add Tailwind or any CSS framework — use plain CSS only.

### Running database migrations

1. Edit `backend/models.py` with the new column or table.
2. Ensure Alembic is initialized (`alembic init alembic` if not present).
3. Generate a revision:
   ```bash
   cd backend
   alembic revision --autogenerate -m "describe change"
   ```
4. Apply:
   ```bash
   alembic upgrade head
   ```
5. Verify:
   ```bash
   psql -U user -d codebase -c "\d chunks"
   ```

### Rebuilding the ChromaDB index for a repo

1. Delete the repo row from PostgreSQL (cascades to `chunks`):
   ```sql
   DELETE FROM repos WHERE id = 'YOUR_REPO_UUID';
   ```
2. Delete vectors from ChromaDB:
   ```bash
   docker compose exec backend python -c "
   from chroma_store import get_chroma_store
   cs = get_chroma_store()
   cs._collection.delete(where={'repo_id': 'YOUR_REPO_UUID'})
   "
   ```
3. Re-submit the GitHub URL via `POST /api/ingest`.

### Fixing styling (required approach)

1. Remove any Tailwind classes or `@import "tailwindcss"` if present — project standard is plain CSS only (Rule 8).
2. Move styles into the appropriate `ComponentName.css` or `App.css`.
3. Import the CSS file in the matching JSX component.

---

## Known Issues and Constraints

- **ChromaDB does not support updating embeddings in-place.** To re-index a repo, delete all its chunks first (see [Rebuilding the ChromaDB index](#rebuilding-the-chromadb-index-for-a-repo)).

- **The sentence-transformers model (`all-MiniLM-L6-v2`) produces 384-dimension vectors.** If you switch models via `EMBED_MODEL`, delete the `chroma_data` volume first or ChromaDB will throw a dimension mismatch error.

- **GitPython clones into a `tempfile.TemporaryDirectory`** which is deleted after ingest completes. Raw file content lives in the `chunks` table and is served via `GET /api/file`.

- **The OpenAI SSE stream does not emit a final `done` event by default.** The frontend `EventSource` should close on `onerror` after the stream ends, or the agent may add an explicit `event: done` in a future version (document here if added).

- **D3 force simulation runs on the main thread.** For graphs over 500 nodes the UI will feel slow. This is a known limitation for v0.1.

- **Docker volume `chroma_data` persists between rebuilds.** If you change the embedding model, run:
  ```bash
  docker compose down -v
  ```
  to wipe all volumes.

- **`GET /api/repo/{id}`** is part of the public API contract but may need to be implemented in `main.py` if not yet present — check `main.py` before assuming it exists.

- **Graph edge `to` values for Python imports** are often module names (e.g. `os`, `fastapi`), not file paths. Only filepath-shaped node IDs will highlight correctly when the LLM emits `[FILE: path]`.

- **Synchronous ingest** blocks the HTTP request for 30–90 seconds on medium repos. Background task + polling is planned post-v0.1.

---

## Git Conventions

### Commit message format

```
type(scope): short description
```

### Types

| Type | Meaning |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code change with no behaviour change |
| `docs` | Documentation only |
| `chore` | Build, deps, config |

### Examples

```
feat(ingest): add TypeScript import parsing via regex
fix(query): handle empty ChromaDB results without crashing
refactor(graph): extract edge deduplication into helper function
docs(agent): update API routes table with new /api/repo endpoint
```

### Branch naming

- `feature/short-name`
- `fix/short-description`
- `refactor/area-name`

**Rule:** The agent must never commit directly to `main`. Always suggest:

```bash
git checkout -b feature/name
```

before making changes.

---

## Performance Notes

- **Embedding model loads once at startup** via the `Embedder` singleton in `embedder.py`. Never instantiate `SentenceTransformer` inside a request handler or per-chunk loop.

- **ChromaDB queries** with `where={"repo_id": "..."}` are fast for fewer than ~10,000 chunks. Beyond that, tune HNSW parameters on the collection metadata.

- **PostgreSQL file lookups** (`SELECT * FROM chunks WHERE repo_id = ? AND filepath = ? ORDER BY chunk_index`) should use a composite index on `(repo_id, filepath)` defined in `models.py` with `Index()`.

- **D3 force simulation** must call `simulation.stop()` in the `useEffect` cleanup when `GraphPanel` unmounts to prevent memory leaks and orphaned timers.

- **Large repos (>1,000 files)** take 30–90 seconds to ingest. For v0.1, synchronous `POST /api/ingest` is acceptable; move to `BackgroundTasks` + `GET /api/repo/{id}/status` polling in a later version.

- **Monaco Editor** should not remount on every token; only refetch `/api/file` when `selectedFile` or `repoId` changes.

- **SSE streaming** should flush each token immediately; avoid buffering the full completion in memory before sending.

---

*End of AGENT.md — Codebase Storyteller v0.1.0*
