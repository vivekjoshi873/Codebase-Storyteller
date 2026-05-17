<div align="center">

# Codebase Storyteller

### Turn any GitHub repository into an interactive,
### AI-narrated visual dependency graph.

![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110-009688?style=flat&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat&logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=flat)

</div>

Paste a GitHub URL and get a live, explorable map of how every file connects — then ask questions in plain English and watch the graph light up as the AI walks you through the code. **Codebase Storyteller** is built for developers onboarding to unfamiliar codebases, engineering interviewers reviewing take-home projects, and CS students who learn faster when structure is visualized before they read line by line. This is not a linter, not a formatter, and not a static diagram generator: it **narrates** the codebase the way a senior engineer would explain it to someone new — with context, file references, and a graph that moves in sync with the story.

## See it in action

```text
$ open http://localhost:5173

> Paste repo URL:  https://github.com/tiangolo/fastapi
> Analysing...     cloning → parsing → embedding → done (18s)
> Graph loaded:    52 nodes · 89 edges

> You: where does request validation happen?

> AI: Request validation starts in routing.py where FastAPI
>     registers each endpoint's parameter types. It delegates
>     to params.py [FILE: fastapi/params.py] which wraps Pydantic
>     models for each declared field. The actual validation runs
>     inside dependencies.py [FILE: fastapi/dependencies.py]
>     before the route handler is ever called.
>
>     → 3 files highlighted on graph ✓
```

The UI is a three-panel workspace tuned for exploration. The **left panel** renders an animated D3 force-directed graph where nodes pulse amber when the LLM mentions them. The **middle panel** streams the conversation with GPT-4o token by token over Server-Sent Events. The **right panel** embeds the Monaco editor — the same engine as VS Code — and loads whichever file you click on the graph.

## Features

| Feature | What it does |
|---------|--------------|
| **Dependency graph** | D3 force-directed graph: every file is a node, every import is an edge. Settles into a readable layout automatically. |
| **Live node highlighting** | When the LLM mentions a file, that node pulses amber on the graph in sync with the streaming text. |
| **AI narration** | GPT-4o streams a plain-English walkthrough of the codebase, structured like a senior engineer's explanation. |
| **RAG-powered Q&A** | ChromaDB retrieves the five most relevant code chunks before the LLM answers — no hallucinated file paths. |
| **Monaco code viewer** | Click any graph node to open that file in the same editor engine as VS Code, with full syntax highlighting. |
| **AST-accurate graph** | Python files are parsed with the `ast` module. TypeScript files use import regex. Edges reflect real dependencies. |
| **Docker-first setup** | One command starts PostgreSQL, the FastAPI backend, and the Vite frontend. No local installs required. |
| **Persistent vector index** | ChromaDB persists to a Docker volume — re-opening the app skips re-embedding already-analysed repos. |

## Tech Stack

### Frontend

| Library | Version | Used for |
|---------|---------|----------|
| React | 18 | UI component tree |
| Vite | 6 | Dev server, HMR, prod bundler |
| D3.js | 7 | Force simulation, SVG graph rendering |
| Monaco Editor | latest | VS Code editor embedded in browser |
| Zustand | 5 | Global state (graph, chat, selected file) |
| Plain CSS | — | Per-component styles, no framework |

### Backend

| Library | Version | Used for |
|---------|---------|----------|
| FastAPI | 0.110+ | Async HTTP routes + SSE streaming |
| SQLAlchemy | 2.0 | Async ORM for PostgreSQL |
| asyncpg | latest | Async PostgreSQL driver |
| Alembic | latest | Database migrations |
| GitPython | latest | Cloning repos into temp directories |
| sentence-transformers | latest | Embedding code chunks (384-dim vectors) |
| ChromaDB | latest | Vector storage and similarity search |
| OpenAI SDK | latest | GPT-4o streaming via `AsyncOpenAI` |
| pydantic | v2 | Request/response schema validation |

### Infrastructure

| Service | Image | Purpose |
|---------|-------|---------|
| db | postgres:16-alpine | Stores repo metadata and chunk text |
| backend | python:3.11-slim | FastAPI app + ingestion pipeline |
| frontend | node:20-alpine | Vite dev server |

### Why these choices over alternatives

- **FastAPI over Flask:** async-native so SSE streaming does not block the event loop while tokens are forwarded to the client.
- **ChromaDB over Pinecone/Weaviate:** runs fully locally with zero signup, which keeps onboarding friction at zero for reviewers and students.
- **D3 over React Flow:** full control over per-tick SVG updates, pulse animations, and force parameters without fighting a higher-level abstraction.
- **Zustand over Redux/Context:** three shared values need three lines of store code, not three files of boilerplate.
- **Monaco over CodeMirror:** identical to VS Code's editing surface, with syntax highlighting that works out of the box.
- **PostgreSQL over SQLite:** supports concurrent writes when multiple ingestion jobs or API handlers touch metadata at the same time.

## Architecture

```text
┌─────────────────────────────────────────┐
│           Browser (port 5173)           │
│                                         │
│  ┌───────────┐ ┌──────────┐ ┌────────┐ │
│  │ GraphPanel│ │ChatPanel │ │Monaco  │ │
│  │  D3.js    │ │ SSE chat │ │ Editor │ │
│  └─────┬─────┘ └────┬─────┘ └───┬────┘ │
│        └────────────┼────────────┘      │
│               Zustand store             │
└───────────────────┬─────────────────────┘
                    │ HTTP / SSE
┌───────────────────▼─────────────────────┐
│         FastAPI Backend (port 8000)     │
│                                         │
│  POST /api/ingest   GET /api/query      │
│  GET  /api/file     GET /api/repo/{id}  │
└──────┬──────────────────────┬───────────┘
       │                      │
┌──────▼──────┐      ┌────────▼────────┐
│ PostgreSQL  │      │    ChromaDB     │
│  port 5432  │      │  (disk volume)  │
│             │      │                 │
│ repos table │      │ code_chunks     │
│ chunks table│      │ collection      │
└─────────────┘      └────────┬────────┘
                              │ top-5 chunks
                     ┌────────▼────────┐
                     │   OpenAI API    │
                     │    gpt-4o       │
                     │  (streaming)    │
                     └─────────────────┘
```

**Data flow:** A user pastes a GitHub URL and the frontend sends `POST /api/ingest`. GitPython clones the repository into a temporary directory while `graph_builder.py` walks Python files with `ast` and TypeScript files with regex to produce nodes and edges. Each file is split into 50-line chunks and embedded by `sentence-transformers` into 384-dimensional vectors that ChromaDB stores alongside `repo_id` and `filepath` metadata, while PostgreSQL persists repo status and chunk text. The graph JSON returns to the browser and D3's `forceSimulation` lays out the SVG. When the user asks a question, the backend embeds the query, retrieves the top-five chunks from ChromaDB, and streams a GPT-4o answer as SSE `message` events plus `highlight` events whenever `[FILE: path]` appears. Zustand distributes those updates so the chat panel appends tokens, the graph pulses matching nodes, and Monaco can load any clicked file via `GET /api/file`.

## Getting Started

### Prerequisites

- [Docker Desktop 4.x](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose plugin)
- [Git 2.x](https://git-scm.com/)
- [OpenAI API key](https://platform.openai.com/api-keys) with access to **gpt-4o**
- *(Optional, for local dev)* [Python 3.11+](https://www.python.org/downloads/) and [Node 20+](https://nodejs.org/)

### Option A — Docker (recommended, one command)

**Step 1 — Clone the repo**

```bash
git clone https://github.com/vivekjoshi873/Codebase-Storyteller.git
cd Codebase-Storyteller
```

**Step 2 — Configure environment**

```bash
cp .env.example .env
```

Open `.env` and set `OPENAI_API_KEY` to your key. All other values work as-is for local Docker.

**Step 3 — Start everything**

```bash
docker compose up --build
```

First build takes 3–5 minutes (downloading embedding models and Python dependencies). Subsequent starts take under 10 seconds.

**Step 4 — Open the app**

```bash
# macOS
open http://localhost:5173

# Windows
start http://localhost:5173

# Linux
xdg-open http://localhost:5173
```

API docs: http://localhost:8000/docs

### Option B — Local development (faster iteration)

**Backend**

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

For local dev, run only the database in Docker:

```bash
docker compose up db
```

This starts PostgreSQL without the other services. Set `DATABASE_URL` in `.env` to point at `localhost:5432` instead of `db`.

### First use walkthrough

1. Open http://localhost:5173
2. Paste a small public repo URL — try https://github.com/pallets/click (small, well-structured, parses in under 20 seconds)
3. Click **Analyse** and watch the graph build
4. Click any node to open its file in the Monaco panel
5. Type a question: `what handles command line argument parsing?`
6. Watch the LLM answer stream in while relevant nodes pulse on the graph

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | yes | — | Full asyncpg connection string |
| `POSTGRES_USER` | yes | — | PostgreSQL username |
| `POSTGRES_PASSWORD` | yes | — | PostgreSQL password |
| `POSTGRES_DB` | yes | `codebase` | PostgreSQL database name |
| `OPENAI_API_KEY` | yes | — | OpenAI secret key (gpt-4o access needed) |
| `CHROMA_PERSIST_DIR` | no | `./chroma_data` | Where ChromaDB stores its index |
| `EMBED_MODEL` | no | `all-MiniLM-L6-v2` | HuggingFace model for embeddings |

```env
DATABASE_URL=postgresql+asyncpg://user:pass@db:5432/codebase
POSTGRES_USER=user
POSTGRES_PASSWORD=pass
POSTGRES_DB=codebase
OPENAI_API_KEY=sk-...
CHROMA_PERSIST_DIR=./chroma_data
EMBED_MODEL=all-MiniLM-L6-v2
```

## API Reference

### POST /api/ingest

Clones the repo, parses imports, builds the graph, embeds all code chunks, and stores everything in PostgreSQL and ChromaDB. Returns the graph JSON for immediate rendering.

```bash
curl -X POST http://localhost:8000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com/pallets/click"}'
```

```json
{
  "repo_id": "3f8a1c2d-4e5f-6789-abcd-ef0123456789",
  "status": "done",
  "graph": {
    "nodes": [
      {"id": "src/click/core.py", "label": "core.py"},
      {"id": "src/click/types.py", "label": "types.py"}
    ],
    "edges": [
      {"from": "src/click/core.py", "to": "click"}
    ]
  }
}
```

### GET /api/query (SSE)

Embeds the question, retrieves the top-five chunks from ChromaDB filtered by `repo_id`, and streams a GPT-4o answer as Server-Sent Events. Two event types: `message` (token text) and `highlight` (filepath).

```bash
curl -N "http://localhost:8000/api/query?q=where+does+validation+happen&repo_id=3f8a1c2d-4e5f-6789-abcd-ef0123456789"
```

```text
event: message
data: Request validation

event: message
data:  starts in

event: highlight
data: src/click/core.py

event: message
data:  where each parameter type is declared...
```

### GET /api/file

Returns the full content of a file by joining its stored chunks in `chunk_index` order.

```bash
curl "http://localhost:8000/api/file?repo_id=3f8a1c2d-4e5f-6789-abcd-ef0123456789&filepath=src/click/core.py"
```

Response body: raw file content as `text/plain`.

### GET /api/repo/{id}

Returns metadata for a previously ingested repository.

```bash
curl http://localhost:8000/api/repo/3f8a1c2d-4e5f-6789-abcd-ef0123456789
```

```json
{
  "id": "3f8a1c2d-4e5f-6789-abcd-ef0123456789",
  "url": "https://github.com/pallets/click",
  "name": "pallets/click",
  "status": "done",
  "created_at": "2026-05-18T10:32:00"
}
```

## Project Structure

```text
codebase-storyteller/
├── docker-compose.yml        # Three services: db, backend, frontend
├── .env.example              # Copy to .env and fill in your keys
├── AGENT.md                  # AI agent instructions for IDE assistants
├── README.md                 # This file
│
├── backend/
│   ├── Dockerfile            # python:3.11-slim + git + pip deps
│   ├── requirements.txt      # All Python dependencies
│   ├── main.py               # FastAPI app, all routes, CORS, startup
│   ├── database.py           # Async engine, SessionLocal, get_db()
│   ├── models.py             # Repo and Chunk ORM tables
│   ├── schemas.py            # Pydantic v2 request/response models
│   ├── ingest.py             # Clone → parse → chunk → embed → store
│   ├── embedder.py           # SentenceTransformer singleton
│   ├── graph_builder.py      # AST (Python) + regex (TS) → nodes/edges
│   ├── chroma_store.py       # ChromaDB add_chunks() and query()
│   └── query.py              # RAG pipeline + SSE async generator
│
└── frontend/
    ├── Dockerfile            # node:20-alpine, npm install, vite dev
    ├── package.json          # React, D3, Monaco, Zustand dependencies
    ├── vite.config.js        # Proxy /api → backend:8000
    ├── index.html            # Single HTML shell, mounts #root
    └── src/
        ├── main.jsx          # ReactDOM.createRoot entry point
        ├── App.jsx           # Three-panel layout, URL input, Analyse button
        ├── App.css           # Global layout, dark theme variables
        ├── store.js          # Zustand store: graphData, activeNodes, chat
        └── components/
            ├── GraphPanel.jsx    # D3 force simulation, node click, pulse
            ├── GraphPanel.css    # Graph container, pulsing keyframe
            ├── ChatPanel.jsx     # SSE EventSource, message bubbles
            ├── ChatPanel.css     # Chat layout, bubble styles
            ├── MonacoPanel.jsx   # Monaco editor, file fetch on selection
            └── MonacoPanel.css   # Editor container, placeholder style
```

## How It Works

### 1. Ingestion pipeline

When a URL is submitted, FastAPI receives `POST /api/ingest` and creates a `Repo` row with `status=processing`. GitPython clones the repository into a `tempfile.TemporaryDirectory` with shallow depth to keep disk usage low. The `graph_builder` module walks every `.py` file with Python's `ast` module — extracting `import` and `from … import` statements — and every `.ts`/`.tsx` file with regex tuned for `import … from '…'` patterns. Each file is split into 50-line chunks, embedded into 384-dimensional vectors by `all-MiniLM-L6-v2`, and written to ChromaDB with `filepath` and `repo_id` metadata while identical text lands in PostgreSQL `chunks` rows. Import relationships become edges in a JSON graph stored in `repos.graph_json` and returned to the frontend in the same response.

### 2. Dependency graph rendering

The frontend receives `{ nodes, edges }` and passes it to D3's `forceSimulation` with three forces: `forceLink` (pulls connected nodes together at distance 100), `forceManyBody` (repels all nodes with strength −200), and `forceCenter` (anchors the layout to the viewport center). On each simulation tick, D3 updates SVG `cx`/`cy` on circles and `x1`/`y1`/`x2`/`y2` on lines directly — React is not in the animation hot path. Clicking a node calls `setSelectedFile(node.id)` in Zustand; `MonacoPanel` watches that field and fetches concatenated chunk text from `GET /api/file`.

### 3. RAG query pipeline

When the user submits a question, `ChatPanel` opens an `EventSource` to `GET /api/query?q=…&repo_id=…`. The backend embeds the question with the same model used during ingestion so vectors are comparable in cosine space. ChromaDB returns the five most similar chunks scoped by `where={"repo_id": "…"}`, which are injected into the GPT-4o system prompt with an instruction to emit `[FILE: filepath]` when citing code. `AsyncOpenAI` streams completion deltas; `query.py` forwards each token as an SSE `message` event and emits `highlight` whenever the regex matches a file marker.

### 4. Real-time panel synchronisation

The SSE stream carries two event types: `message` events hold LLM token text; `highlight` events hold a repo-relative filepath. `ChatPanel` calls `updateLastMessage` on every message event so the assistant bubble grows live. `GraphPanel` watches `activeNodes` and applies a pulsing animation to matching circle elements for three seconds. `MonacoPanel` loads file content only when `selectedFile` changes. All three panels are decoupled — they coordinate exclusively through the Zustand store, never through prop chains.

## Troubleshooting

| Symptom | Likely cause | Fix | Prevention |
|---------|--------------|-----|------------|
| ChromaDB dimension mismatch error | Embedding model changed after data was stored | `docker compose down -v && docker compose up --build` | Never change `EMBED_MODEL` on an existing `chroma_data` volume |
| Backend exits immediately on startup | PostgreSQL not ready yet | Wait 15s, then `docker compose restart backend` | `depends_on` healthcheck on `db` handles clean starts |
| Graph renders nodes but no edges | Repo uses non-standard or dynamic imports | Expected for some repos; try a Python repo first | JS/TS edges are regex-based and may miss dynamic imports |
| CORS error in browser console | Vite proxy target wrong for your setup | In Docker: proxy `http://backend:8000`; locally: `http://localhost:8000` | Keep `/api` proxied — never call port 8000 directly from the browser in dev |
| Monaco panel shows blank | `/api/file` returned 404 or empty chunks | `curl` `/api/file` with the same `repo_id` and `filepath` | Confirm ingest finished with `status=done` before querying |
| LLM answer cites wrong file paths | Weak or empty RAG context | Verify Chroma has chunks; re-ingest the repo | Always wait for ingest to complete before opening chat |

## Roadmap

#### v0.1 — current release

- [x] D3 force-directed dependency graph from AST parsing
- [x] ChromaDB RAG pipeline with top-5 retrieval
- [x] GPT-4o streaming narration via SSE
- [x] Monaco code viewer with syntax highlighting
- [x] Live node pulse on LLM file mention
- [x] Docker Compose one-command setup
- [x] PostgreSQL metadata storage with SQLAlchemy async

#### v0.2 — next

- [ ] Background ingestion with real-time progress bar
- [ ] Git history timeline — narrate what changed across commits
- [ ] Support for Go, Rust, and Java import parsing
- [ ] pgvector extension replacing ChromaDB (single DB)
- [ ] User accounts with saved repo history

#### v0.3 — future

- [ ] Pull request diff narration ("explain what changed in this PR")
- [ ] Team mode — shared annotations pinned to graph nodes
- [ ] Graph export as SVG / PNG
- [ ] Self-hosted LLM support (Ollama, llama.cpp)
- [ ] CLI version: `codebase-storyteller analyse <url>`

## Contributing

Contributions are welcome — whether you fix a parser edge case, tighten the RAG prompt, or polish the graph animation. This is an active project; pull requests are typically reviewed within a few days.

### Getting started

1. Fork the repository
2. `git checkout -b feature/your-feature-name`
3. Make your changes (see code style below)
4. `git commit -m "feat(scope): description"`
5. Open a pull request against `main`

### Code style

**Backend**

```bash
cd backend
black .          # auto-format
ruff check .     # lint
mypy .           # type check
```

Rules: type hints on every function signature, no bare `except`, no hardcoded secrets or database URLs — use `load_dotenv()` and `os.getenv()`.

**Frontend**

```bash
cd frontend
npm run dev      # verify the app runs
```

Rules: functional components only, JSDoc on every component, styles in dedicated `.css` files (no CSS frameworks in new code).

### Commit format

```
type(scope): short description
```

| Type | Use when |
|------|----------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Behaviour unchanged |
| `docs` | Documentation only |
| `chore` | Build, deps, config |

Examples:

```text
feat(ingest): add TypeScript import parsing via regex
fix(query): handle empty ChromaDB results without crashing
docs(readme): add API reference for /api/repo endpoint
```

---

<div align="center">

**MIT License** · Built with FastAPI, React, D3, and GPT-4o

If this project helped you onboard to a codebase faster, consider giving it a star.

</div>
