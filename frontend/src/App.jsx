import { useState } from "react";
import GraphPanel from "./components/GraphPanel";
import ChatPanel from "./components/ChatPanel";
import MonacoPanel from "./components/MonacoPanel";
import { useStore } from "./store";

const POLL_INTERVAL_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function App() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const setRepoId = useStore((s) => s.setRepoId);
  const setGraphData = useStore((s) => s.setGraphData);

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
    <div className="flex min-h-screen flex-col bg-[#0f0f0f] text-[#e8e8e8]">
      <header className="flex items-center gap-4 border-b border-zinc-800 bg-zinc-900 px-5 py-3.5">
        <h1 className="shrink-0 text-lg font-semibold">Codebase Storyteller</h1>
        <form onSubmit={handleAnalyse} className="flex flex-1 gap-2">
          <input
            type="url"
            placeholder="https://github.com/owner/repo"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            className="flex-1 rounded-lg border border-zinc-700 bg-[#0f0f0f] px-3 py-2 text-sm text-[#e8e8e8] outline-none focus:border-emerald-400"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Analysing..." : "Analyse"}
          </button>
        </form>
        {status && !error && (
          <span className="max-w-md truncate text-xs text-zinc-400">{status}</span>
        )}
        {error && (
          <span className="max-w-xs truncate text-xs text-red-400" title={error}>
            {error}
          </span>
        )}
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[40%_35%_25%]">
        <section className="flex min-h-0 flex-col border-r border-zinc-800">
          <div className="border-b border-zinc-800 px-3.5 py-2.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Dependency graph
          </div>
          <div className="relative min-h-0 flex-1">
            <GraphPanel />
          </div>
        </section>

        <section className="flex min-h-0 flex-col border-r border-zinc-800">
          <div className="border-b border-zinc-800 px-3.5 py-2.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Chat
          </div>
          <ChatPanel />
        </section>

        <section className="flex min-h-0 flex-col">
          <div className="border-b border-zinc-800 px-3.5 py-2.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Code viewer
          </div>
          <div className="relative min-h-0 flex-1">
            <MonacoPanel />
          </div>
        </section>
      </main>
    </div>
  );
}
