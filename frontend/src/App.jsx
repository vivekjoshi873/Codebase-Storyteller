import { useState } from "react";
import GraphPanel from "./components/GraphPanel";
import ChatPanel from "./components/ChatPanel";
import MonacoPanel from "./components/MonacoPanel";
import { useStore } from "./store";

const POLL_INTERVAL_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function PanelHeader({ title, meta }) {
  return (
    <div className="flex h-11 items-center justify-between border-b border-zinc-800/80 bg-zinc-950/70 px-4">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        {title}
      </span>
      {meta && <span className="text-xs text-zinc-500">{meta}</span>}
    </div>
  );
}

export default function App() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const repoId = useStore((s) => s.repoId);
  const graphData = useStore((s) => s.graphData);
  const selectedFile = useStore((s) => s.selectedFile);
  const setRepoId = useStore((s) => s.setRepoId);
  const setGraphData = useStore((s) => s.setGraphData);

  const graphMeta = `${graphData.nodes.length.toLocaleString()} files / ${graphData.edges.length.toLocaleString()} imports`;

  const pollRepoStatus = async (repoId) => {
    while (true) {
      const response = await fetch(`/api/repo/${repoId}`);

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.detail || payload.error || "Status check failed");
      }

      const data = await response.json();

      if (data.status === "done") {
        setGraphData(data.graph);
        setStatus(
          `Done - ${data.graph?.nodes?.length ?? 0} files, ${data.graph?.edges?.length ?? 0} imports.`,
        );
        return;
      }

      if (data.status === "failed") {
        throw new Error(data.error || "Ingest failed");
      }

      setStatus("Analysing in background... cloning, parsing, embedding, and storing chunks.");
      await sleep(POLL_INTERVAL_MS);
    }
  };

  const handleAnalyse = async (event) => {
    event.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError("");
    setGraphData({ nodes: [], edges: [] });
    setStatus("Starting analysis...");

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!response.ok) {
        const payload = await response.json();
        const detail = payload.detail ?? payload.error;
        const message = Array.isArray(detail)
          ? detail.map((item) => item.msg || String(item)).join(", ")
          : detail || payload.error || "Ingest failed";
        throw new Error(message);
      }

      const data = await response.json();
      setRepoId(data.repo_id);

      if (data.status === "done") {
        setGraphData(data.graph);
        setStatus(
          `Done - ${data.graph?.nodes?.length ?? 0} files, ${data.graph?.edges?.length ?? 0} imports.`,
        );
        return;
      }

      setStatus("Analysis started. Waiting for the backend to finish...");
      await pollRepoStatus(data.repo_id);
    } catch (err) {
      setError(err.message);
      setStatus("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#080b0f] text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-950/95 px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="flex min-w-[170px] flex-col">
            <h1 className="text-base font-semibold tracking-tight text-white">
              Codebase Storyteller
            </h1>
            <span className="text-[11px] text-zinc-500">repo map and code chat</span>
          </div>

          <form onSubmit={handleAnalyse} className="flex min-w-0 flex-1 gap-2">
            <input
              type="url"
              placeholder="https://github.com/owner/repo"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              className="h-10 min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/15"
            />
            <button
              type="submit"
              disabled={loading}
              className="h-10 rounded-md bg-emerald-400 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Analysing..." : "Analyse"}
            </button>
          </form>

          <div className="flex min-w-[210px] justify-end">
            {error ? (
              <span
                className="max-w-[260px] truncate rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs text-red-300"
                title={error}
              >
                {error}
              </span>
            ) : (
              <span className="max-w-[300px] truncate rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-400">
                {status || (repoId ? "Ready" : "Paste a GitHub repo URL")}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[40%_35%_25%] overflow-hidden">
        <section className="flex min-h-0 flex-col border-r border-zinc-800 bg-[#090c10]">
          <PanelHeader title="Dependency graph" meta={graphMeta} />
          <div className="relative min-h-0 flex-1">
            <GraphPanel />
          </div>
        </section>

        <section className="flex min-h-0 flex-col border-r border-zinc-800 bg-[#0b0d11]">
          <PanelHeader title="Chat" meta={repoId ? "Ask with RAG context" : "Waiting for repo"} />
          <ChatPanel />
        </section>

        <section className="flex min-h-0 flex-col bg-[#0b0d11]">
          <PanelHeader title="Code viewer" meta={selectedFile || "No file selected"} />
          <div className="relative min-h-0 flex-1">
            <MonacoPanel />
          </div>
        </section>
      </main>
    </div>
  );
}
