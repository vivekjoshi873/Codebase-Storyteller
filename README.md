# Codebase Storyteller

Production-ready web app: paste a GitHub URL, explore an import graph, read code in Monaco, and stream LLM answers over SSE.

## Run with Docker

```bash
cp .env.example .env
# Edit .env — set OPENAI_API_KEY and matching Postgres credentials
docker compose up --build
```

- UI: http://localhost:5173  
- API: http://localhost:8000/docs  

## Run locally

```bash
# Terminal 1 — database only
docker compose up db

# Terminal 2 — backend
cd backend
pip install -r requirements.txt
# Set DATABASE_URL and OPENAI_API_KEY (see .env.example)
uvicorn main:app --reload --port 8000

# Terminal 3 — frontend
cd frontend
npm install
npm run dev
```

Local Vite proxies `/api` to `http://localhost:8000`.
