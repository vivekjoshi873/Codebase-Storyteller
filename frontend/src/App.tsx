import { useEffect, useMemo, useState, type JSX } from "react";
import GraphPanel from "./components/GraphPanel";
import ChatPanel from "./components/ChatPanel";
import MonacoPanel from "./components/MonacoPanel";
import { useStore } from "./store";
import type { AppView, IngestResponse, StatusResponse } from "@/types";

const POLL_INTERVAL_MS = 2000;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const STEPS: string[] = [
  "Cloning repository",
  "Building dependency graph",
  "Embedding code chunks",
  "Storing vectors",
];

const EXAMPLES: string[] = ["pallets/click", "tiangolo/fastapi", "pydantic/pydantic", "encode/httpx"];

const App = (): JSX.Element => {
  const [view, setView] = useState<AppView>("landing");
  const [url, setUrl] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [currentStep, setCurrentStep] = useState<number>(0);

  const repoId = useStore((s) => s.repoId);
  const setRepoId = useStore((s) => s.setRepoId);
  const setRepoName = useStore((s) => s.setRepoName);
  const setGraphData = useStore((s) => s.setGraphData);
  const reset = useStore((s) => s.reset);

  const workspaceStatus: "ready" | "waiting" = repoId ? "ready" : "waiting";

  const repoName = useMemo((): string => {
    try {
      return new URL(url).pathname.replace(/^\//, "").replace(/\.git$/, "");
    } catch {
      return url || "repository";
    }
  }, [url]);

  useEffect((): (() => void) | void => {
    if (!loading) {
      setCurrentStep(0);
      return;
    }
    const interval = setInterval((): void => {
      setCurrentStep((prev) => Math.min(prev + 1, 3));
    }, 8000);
    return (): void => clearInterval(interval);
  }, [loading]);

  const pollRepoStatus = async (id: string): Promise<void> => {
    while (true) {
      const response = await fetch(`/api/repo/${id}`);

      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string; error?: string };
        throw new Error(payload.detail || payload.error || "Status check failed");
      }

      const data = (await response.json()) as StatusResponse;

      if (data.status === "done") {
        const graph = data.graph ?? { nodes: [], edges: [] };
        setGraphData(graph);
        setStatus(`Done - ${graph.nodes.length} files, ${graph.edges.length} imports.`);
        return;
      }

      if (data.status === "failed") {
        throw new Error(data.error || "Ingest failed");
      }

      setStatus("Analysing in background... cloning, parsing, embedding, and storing chunks.");
      await sleep(POLL_INTERVAL_MS);
    }
  };

  const runAnalyse = async (nextUrl: string): Promise<void> => {
    if (!nextUrl.trim()) return;

    setLoading(true);
    setError("");
    setGraphData({ nodes: [], edges: [] });
    setStatus("Starting analysis...");

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: nextUrl.trim() }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as {
          detail?: string | Array<{ msg?: string }>;
          error?: string;
        };
        const detail = payload.detail ?? payload.error;
        const message = Array.isArray(detail)
          ? detail.map((item) => item.msg || String(item)).join(", ")
          : detail || payload.error || "Ingest failed";
        throw new Error(message);
      }

      const data = (await response.json()) as IngestResponse;
      setRepoId(data.repo_id);
      setRepoName(repoName);

      if (data.status === "done") {
        setGraphData(data.graph);
        setStatus(`Done - ${data.graph.nodes.length} files, ${data.graph.edges.length} imports.`);
        setView("workspace");
        return;
      }

      setStatus("Analysis started. Waiting for the backend to finish...");
      await pollRepoStatus(data.repo_id);
      setView("workspace");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setStatus("");
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyse = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    await runAnalyse(url);
  };

  const handleExampleClick = async (example: string): Promise<void> => {
    const fullUrl = `https://github.com/${example}`;
    setUrl(fullUrl);
    await runAnalyse(fullUrl);
  };

  const handleNewRepo = (): void => {
    reset();
    setView("landing");
    setUrl("");
    setError("");
    setStatus("");
    setLoading(false);
    setCurrentStep(0);
  };

  if (view === "workspace") {
    return (
      <div className="flex flex-col h-screen bg-canvas overflow-hidden">
        <div className="flex items-center justify-between px-6 h-12 border-b border-[#222222] flex-shrink-0 bg-[#0A0A0A]">
          <span className="font-mono text-label text-ink-muted tracking-widest uppercase">CODEBASE STORYTELLER</span>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-ink-primary">{repoName}</span>
          </div>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              {workspaceStatus === "ready" && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
              <span className={`text-label tracking-widest uppercase ${workspaceStatus === "ready" ? "text-green-400" : "text-ink-muted"}`}>
                {workspaceStatus === "ready" ? "READY" : "WAITING FOR REPO"}
              </span>
            </div>
            <button
              onClick={handleNewRepo}
              className="text-label text-ink-muted tracking-widest uppercase editorial-link cursor-pointer hover:text-ink-primary transition-colors"
            >
              {"<- NEW REPO"}
            </button>
          </div>
        </div>

        <div className="grid flex-1 overflow-hidden" style={{ gridTemplateColumns: "42% 33% 25%" }}>
          <div className="border-r border-border overflow-hidden">
            <GraphPanel />
          </div>
          <div className="border-r border-border overflow-hidden">
            <ChatPanel />
          </div>
          <div className="overflow-hidden">
            <MonacoPanel />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <div className="w-full border-b border-border flex items-center justify-center h-8 px-4">
        <div className="flex items-center gap-2 text-label text-ink-secondary tracking-widest uppercase">
          <span>Codebase Storyteller</span>
          <span className="text-ink-muted">·</span>
          <span>Paste any public GitHub repo to begin</span>
          <span className="text-ink-muted">·</span>
          <span className="text-accent font-medium">Free</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full px-6 py-24">
        <p className="text-label text-ink-muted tracking-widest uppercase mb-6 animate-fade-up">AI-powered code intelligence</p>

        <h1 className="text-display font-bold text-ink-primary mb-8 animate-fade-up" style={{ animationDelay: "0.05s" }}>
          Understand <em className="font-serif-italic font-normal not-italic text-ink-primary" style={{ fontStyle: "italic" }}>any</em> codebase.
        </h1>

        <p className="text-lg text-ink-secondary font-light leading-relaxed mb-12 max-w-lg animate-fade-up" style={{ animationDelay: "0.1s" }}>
          Paste a GitHub URL. Get an interactive dependency graph, AI narration, and a codebase Q&A - in under 60 seconds.
        </p>

        <div className="animate-fade-up" style={{ animationDelay: "0.15s" }}>
          <form
            onSubmit={handleAnalyse}
            className="flex items-center gap-0 border border-border rounded-none bg-canvas hover:border-border-light focus-within:border-accent-border focus-within:shadow-[0_0_0_3px_rgba(232,255,139,0.06)] transition-all duration-200"
          >
            <input
              type="url"
              placeholder="https://github.com/owner/repo"
              value={url}
              onChange={(e: React.ChangeEvent<HTMLInputElement>): void => setUrl(e.target.value)}
              required
              className="flex-1 bg-transparent font-mono text-sm text-ink-primary px-5 py-4 outline-none placeholder:text-ink-muted"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-4 text-sm font-semibold text-canvas bg-ink-primary hover:bg-accent hover:text-canvas transition-all duration-150 whitespace-nowrap disabled:opacity-70"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border border-canvas border-t-transparent rounded-full animate-spin-slow" />
                  Analysing
                </span>
              ) : (
                "Analyse →"
              )}
            </button>
          </form>

          {error && <p className="mt-4 text-sm text-danger font-mono">{error}</p>}
          {status && <p className="mt-3 text-xs text-ink-muted font-mono">{status}</p>}

          {loading && (
            <div className="mt-8 pt-8 border-t border-border animate-fade-in">
              {STEPS.map((step: string, i: number) => {
                const state = i < currentStep ? "done" : i === currentStep ? "active" : "pending";
                if (state === "done") {
                  return (
                    <div key={step} className="flex items-center gap-4 py-3 border-b border-border">
                      <span className="text-label text-success tracking-widest">DONE</span>
                      <span className="text-sm text-ink-muted line-through">{step}</span>
                    </div>
                  );
                }
                if (state === "active") {
                  return (
                    <div key={step} className="flex items-center gap-4 py-3 border-b border-border">
                      <span className="w-3 h-3 border border-ink-muted border-t-ink-primary rounded-full animate-spin-slow" />
                      <span className="text-sm text-ink-primary font-medium">{step}</span>
                    </div>
                  );
                }
                return (
                  <div key={step} className="flex items-center gap-4 py-3 border-b border-border">
                    <span className="text-label text-ink-muted">-</span>
                    <span className="text-sm text-ink-muted">{step}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 animate-fade-up" style={{ animationDelay: "0.2s" }}>
          <span className="text-label text-ink-muted tracking-widest uppercase">Try</span>
          {EXAMPLES.map((example: string) => (
            <button
              key={example}
              onClick={(): void => {
                void handleExampleClick(example);
              }}
              className="font-mono text-xs text-ink-secondary editorial-link cursor-pointer hover:text-ink-primary transition-colors"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto py-8 border-t border-border">
        <div className="max-w-2xl mx-auto px-6 flex items-center justify-between">
          <span className="text-label text-ink-muted tracking-widest">© 2026 CODEBASE STORYTELLER</span>
          <span className="text-label text-ink-muted tracking-widest">BUILT WITH FASTAPI · CHROMADB · GPT-4O</span>
        </div>
      </div>
    </div>
  );
};

export default App;
