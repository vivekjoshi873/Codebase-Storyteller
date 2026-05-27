import { useEffect, useMemo, useState, type JSX } from "react";
import GraphPanel from "./components/GraphPanel";
import ChatPanel from "./components/ChatPanel";
import MonacoPanel from "./components/MonacoPanel";
import { useStore } from "./store";
import type { AppView, GraphData, IngestResponse, StatusResponse } from "@/types";

const POLL_INTERVAL_MS = 2000;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const STEPS: Array<{ icon: string; label: string; time: string }> = [
  { icon: "â–¸", label: "Cloning repository", time: "0.0s" },
  { icon: "â–¸", label: "Building import graph", time: "1.2s" },
  { icon: "â–¸", label: "Embedding chunks", time: "3.1s" },
  { icon: "â–¸", label: "Storing vectors", time: "8.4s" },
];

const EXAMPLES: string[] = ["pallets/click", "tiangolo/fastapi", "pydantic/pydantic", "encode/httpx"];

const parseRepoName = (value: string): string => {
  try {
    return new URL(value).pathname.replace(/^\//, "").replace(/\.git$/, "") || "repository";
  } catch {
    return value.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "") || "repository";
  }
};

const Spinner = ({ tone = "light" }: { tone?: "light" | "dark" }): JSX.Element => {
  const className = tone === "dark"
    ? "w-3.5 h-3.5 border border-ink-inverted/30 border-t-ink-inverted rounded-full animate-spin-fast"
    : "w-3.5 h-3.5 border border-ink-muted border-t-accent rounded-full animate-spin-fast";
  return <span className={className} aria-hidden="true" />;
};

const ProductPreview = (): JSX.Element => (
  <div className="animate-fade-up lg:animate-slide-right relative w-full max-w-[620px] ml-auto" style={{ animationDelay: "0.2s" }}>
    <div className="rounded-2xl border border-line bg-surface overflow-hidden shadow-command">
      <div className="flex items-center justify-between px-4 h-9 border-b border-line bg-raised">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green" />
          <span className="mono-data text-ink-secondary">product-preview</span>
        </div>
        <span className="eyebrow text-ink-disabled">CODEBASE STORYTELLER</span>
      </div>
      <img
        src="/bg.png"
        alt="Codebase Storyteller dependency graph, AI chat, and code viewer preview"
        className="block w-full h-[440px] md:h-[520px] object-cover bg-base"
        loading="eager"
      />
    </div>
  </div>
);

const App = (): JSX.Element => {
  const [view, setView] = useState<AppView>("landing");
  const [url, setUrl] = useState<string>("");
  const [showInput, setShowInput] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [currentStep, setCurrentStep] = useState<number>(0);

  const storedRepoName = useStore((s) => s.repoName);
  const graphData = useStore((s) => s.graphData);
  const setRepoId = useStore((s) => s.setRepoId);
  const setRepoName = useStore((s) => s.setRepoName);
  const setGraphData = useStore((s) => s.setGraphData);
  const reset = useStore((s) => s.reset);

  const repoName = useMemo((): string => parseRepoName(url), [url]);
  const workspaceRepoName = storedRepoName ?? repoName;
  const nodeCount = graphData.nodes.length;
  const edgeCount = graphData.edges.length;

  useEffect((): (() => void) | void => {
    if (!loading) {
      setCurrentStep(0);
      return;
    }
    const interval = window.setInterval((): void => {
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
    }, 2600);
    return (): void => window.clearInterval(interval);
  }, [loading]);

  const pollRepoStatus = async (id: string): Promise<GraphData> => {
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
        return graph;
      }

      if (data.status === "failed") {
        throw new Error(data.error || "Ingest failed");
      }

      setStatus("Analysing in background... cloning, parsing, embedding, and storing chunks.");
      await sleep(POLL_INTERVAL_MS);
    }
  };

  const runAnalyse = async (nextUrl: string): Promise<void> => {
    if (!nextUrl.trim() || loading) return;

    const cleanUrl = nextUrl.trim();
    const nextRepoName = parseRepoName(cleanUrl);
    setLoading(true);
    setError("");
    setGraphData({ nodes: [], edges: [] });
    setStatus("Starting analysis...");

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: cleanUrl }),
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
      setRepoName(nextRepoName);

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
    setShowInput(true);
    setUrl(fullUrl);
    await runAnalyse(fullUrl);
  };

  const fillWithExample = (): void => {
    setShowInput(true);
    setUrl("https://github.com/pallets/click");
  };

  const handleNewRepo = (): void => {
    reset();
    setView("landing");
    setUrl("");
    setShowInput(false);
    setError("");
    setStatus("");
    setLoading(false);
    setCurrentStep(0);
  };

  if (view === "workspace") {
    return (
      <div className="flex flex-col h-screen bg-base overflow-hidden">
        <div className="flex items-center justify-between px-5 h-11 border-b border-line bg-base flex-shrink-0 z-20">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md bg-ink-primary flex items-center justify-center">
              <span className="font-mono text-[9px] font-bold text-ink-inverted tracking-[-0.05em]">CS</span>
            </div>
            <span className="w-px h-3 bg-line-strong" />
            <span className="text-sm text-ink-secondary">Codebase Storyteller</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-line bg-raised hover:border-line-strong transition-all duration-100 cursor-default">
            <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
            <span className="mono-data text-ink-primary">{workspaceRepoName}</span>
            <span className="text-ink-muted mx-0.5">Â·</span>
            <span className="mono-data text-ink-muted text-[11px]">{nodeCount} files Â· {edgeCount} imports</span>
          </div>

          <div className="flex items-center gap-1">
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-raised border border-line">
              <kbd className="font-mono text-[10px] text-ink-muted">âŒ˜K</kbd>
              <span className="text-[10px] text-ink-muted">Command</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-raised border border-line">
              <kbd className="font-mono text-[10px] text-ink-muted">âŒ˜/</kbd>
              <span className="text-[10px] text-ink-muted">Chat</span>
            </div>
            <span className="w-px h-3 bg-line-strong mx-1" />
            <button
              type="button"
              onClick={handleNewRepo}
              className="px-3 py-1.5 rounded-lg border border-line text-sm text-ink-secondary hover:text-ink-primary hover:border-line-strong hover:bg-raised transition-all duration-100"
            >
              â† New repo
            </button>
          </div>
        </div>

        <div className="grid flex-1 overflow-hidden" style={{ gridTemplateColumns: "42% 33% 25%" }}>
          <div className="border-r border-line overflow-hidden">
            <GraphPanel />
          </div>
          <div className="border-r border-line overflow-hidden">
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
    <div className="min-h-screen bg-base flex flex-col">
      <div className="flex items-center justify-between px-8 h-14 border-b border-line bg-base relative z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-ink-primary flex items-center justify-center flex-shrink-0">
            <span className="font-mono text-[11px] font-bold text-ink-inverted tracking-[-0.05em]">CS</span>
          </div>
          <span className="w-px h-4 bg-line-strong mx-1" />
          <span className="text-md font-medium text-ink-primary">Codebase Storyteller</span>
        </div>
      </div>

      <main className="flex-1 flex items-center justify-center px-8 pb-16 pt-8">
        <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_620px] gap-16 items-center">
          <section>
            <h1 className="text-display font-semibold text-ink-primary mb-6 animate-fade-up" style={{ animationDelay: "0.06s" }}>
              Understand <span className="hero-italic">any</span> codebase.
              <br />
              <span className="text-gradient">In minutes.</span>
            </h1>

            <p className="text-lg text-ink-secondary font-light leading-7 mb-10 max-w-[440px] animate-fade-up" style={{ animationDelay: "0.12s" }}>
              Paste a GitHub URL. Watch the dependency graph render. Ask the AI anything about the codebase â€” answers come from your actual code, not hallucination.
            </p>

            <div className="animate-fade-up max-w-[520px]" style={{ animationDelay: "0.18s" }}>
              {!showInput ? (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={(): void => setShowInput(true)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-ink-primary text-ink-inverted text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all duration-100 shadow-float-sm"
                  >
                    <span>Analyse a repo</span>
                    <span className="text-sm">â†’</span>
                  </button>
                  <button
                    type="button"
                    onClick={fillWithExample}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-line text-ink-secondary text-sm hover:border-line-strong hover:text-ink-primary hover:bg-raised transition-all duration-100"
                  >
                    Try an example
                  </button>
                </div>
              ) : (
                <form onSubmit={handleAnalyse} className="flex items-center rounded-xl border border-line bg-raised overflow-hidden focus-within:border-line-focus focus-within:shadow-focus transition-all duration-150">
                  <input
                    type="url"
                    placeholder="https://github.com/owner/repo"
                    value={url}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setUrl(event.target.value)}
                    required
                    autoFocus
                    className="flex-1 bg-transparent mono-data text-ink-primary px-4 py-3.5 outline-none placeholder:text-ink-muted placeholder:font-sans"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center gap-2 px-5 py-3.5 bg-ink-primary text-ink-inverted text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all duration-100 border-l border-line whitespace-nowrap disabled:opacity-40"
                  >
                    {loading ? <><Spinner tone="dark" />Analysing</> : "Analyse â†’"}
                  </button>
                </form>
              )}

              {error && <p className="mt-4 mono-data text-red">{error}</p>}
              {status && !loading && <p className="mt-3 mono-data text-ink-muted">{status}</p>}

              {loading && (
                <div className="mt-6 rounded-lg bg-raised border border-line overflow-hidden animate-fade-in">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-line">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    <span className="mono-data text-ink-muted">ingestion.log</span>
                  </div>
                  <div className="px-4 py-3 space-y-1.5 font-mono text-xs">
                    {STEPS.map((step, index) => {
                      const state = index < currentStep ? "done" : index === currentStep ? "active" : "pending";
                      if (state === "done") {
                        return (
                          <div key={step.label} className="flex items-center gap-3 text-ink-muted log-line" style={{ animationDelay: `${index * 0.08}s` }}>
                            <span className="text-green">âœ“</span>
                            <span className="text-ink-secondary">{step.label}</span>
                            <span className="ml-auto text-ink-disabled mono-data">{step.time}</span>
                          </div>
                        );
                      }
                      if (state === "active") {
                        return (
                          <div key={step.label} className="flex items-center gap-3 text-ink-primary log-line animate-step-activate" style={{ animationDelay: `${index * 0.08}s` }}>
                            <span className="w-2.5 h-2.5 border border-ink-muted border-t-accent rounded-full animate-spin-fast" />
                            <span className="text-ink-primary font-medium">{step.label}</span>
                            <span className="ml-auto text-accent mono-data animate-cursor-blink">...</span>
                          </div>
                        );
                      }
                      return (
                        <div key={step.label} className="flex items-center gap-3 text-ink-disabled">
                          <span className="opacity-30">{step.icon}</span>
                          <span>{step.label}</span>
                          <span className="ml-auto">â€”</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center gap-1.5 flex-wrap animate-fade-up" style={{ animationDelay: "0.24s" }}>
              <span className="eyebrow mr-2">TRY</span>
              {EXAMPLES.map((example) => (
                <button
                  type="button"
                  key={example}
                  onClick={(): void => {
                    void handleExampleClick(example);
                  }}
                  className="mono-data text-ink-muted hover:text-accent cursor-pointer transition-colors duration-100 underline underline-offset-2 decoration-line"
                >
                  {example}
                </button>
              ))}
            </div>
          </section>

          <ProductPreview />
        </div>
      </main>
    </div>
  );
};

export default App;
