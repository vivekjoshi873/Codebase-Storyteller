import { useState } from "react";
import GraphPanel from "./components/GraphPanel";
import ChatPanel from "./components/ChatPanel";
import MonacoPanel from "./components/MonacoPanel";
import { useStore } from "./store";

export default function App() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const setRepoId = useStore((s) => s.setRepoId);
  const setGraphData = useStore((s) => s.setGraphData);

  const handleAnalyse = async (event) => {
    event.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!response.ok) {
        const payload = await response.json();
        const detail = payload.detail;
        const message = Array.isArray(detail)
          ? detail.map((item) => item.msg || String(item)).join(", ")
          : detail || "Ingest failed";
        throw new Error(message);
      }

      const data = await response.json();
      setRepoId(data.repo_id);
      setGraphData(data.graph);
    } catch (err) {
      setError(err.message);
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
            {loading ? "Analysing…" : "Analyse"}
          </button>
        </form>
        {error && (
          <span className="max-w-xs truncate text-xs text-red-400">{error}</span>
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
