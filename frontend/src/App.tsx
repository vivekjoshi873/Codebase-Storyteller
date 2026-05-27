import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type JSX } from "react";
import GraphPanel from "./components/GraphPanel";
import ChatPanel from "./components/ChatPanel";
import MonacoPanel from "./components/MonacoPanel";
import ThemeToggle from "@/components/ThemeToggle";
import { useStore } from "./store";
import type { AppView, GraphData, IngestResponse, StatusResponse } from "@/types";

const POLL_INTERVAL_MS = 2000;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const STEPS: Array<{ icon: string; label: string; time: string }> = [
  { icon: ">", label: "Cloning repository", time: "0.0s" },
  { icon: ">", label: "Building import graph", time: "1.2s" },
  { icon: ">", label: "Embedding chunks", time: "3.1s" },
  { icon: ">", label: "Storing vectors", time: "8.4s" },
];

const EXAMPLES: string[] = ["pallets/click", "tiangolo/fastapi", "pydantic/pydantic", "encode/httpx"];

const primaryText = "text-[#0F0F12] dark:text-[#F2F2F4]";
const secondaryText = "text-[#4A4A58] dark:text-[#9B9BA8]";
const mutedText = "text-[#8A8A9A] dark:text-[#5A5A68]";
const disabledText = "text-[#C0C0CC] dark:text-[#36363F]";
const border = "border-black/[0.08] dark:border-white/[0.08]";
const borderStrong = "border-black/[0.14] dark:border-white/[0.14]";
const raised = "bg-[#E5E2D8] dark:bg-[#18181F]";
const primaryButton = "bg-[#0F0F12] dark:bg-[#F2F2F4] text-[#F8F6F1] dark:text-[#0A0A0F]";

const parseRepoName = (value: string): string => {
  try {
    return new URL(value).pathname.replace(/^\//, "").replace(/\.git$/, "") || "repository";
  } catch {
    return value.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "") || "repository";
  }
};

const Spinner = ({ tone = "light" }: { tone?: "light" | "dark" }): JSX.Element => {
  const className = tone === "dark"
    ? "w-3.5 h-3.5 border border-[#F8F6F1]/30 dark:border-[#0A0A0F]/30 border-t-[#F8F6F1] dark:border-t-[#0A0A0F] rounded-full animate-spin-fast"
    : "w-3.5 h-3.5 border border-[#8A8A9A] dark:border-[#5A5A68] border-t-accent rounded-full animate-spin-fast";
  return <span className={className} aria-hidden="true" />;
};

const ProductPreview = (): JSX.Element => (
  <div className="animate-fade-up lg:animate-slide-right relative w-full max-w-[760px] lg:ml-0" style={{ animationDelay: "0.2s" }}>
    <div className="theme-aware rounded-2xl border border-black/[0.10] dark:border-white/[0.08] bg-[#ECEAE2] dark:bg-[#111118] overflow-hidden shadow-command">
      <div className="theme-aware flex items-center justify-between px-4 h-9 border-b border-black/[0.08] dark:border-white/[0.08] bg-[#E5E2D8] dark:bg-[#18181F]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green" />
          <span className={`mono-data ${secondaryText}`}>product-preview</span>
        </div>
        <span className={`eyebrow ${disabledText}`}>CODEBASE STORYTELLER</span>
      </div>
      <img
        src="/bg.png"
        alt="Codebase Storyteller dependency graph, AI chat, and code viewer preview"
        className="theme-aware block w-full h-[440px] md:h-[540px] object-cover bg-[#F2EFE8] dark:bg-[#0A0A0F]"
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

  const handleAnalyse = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
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
      <div className="theme-aware flex flex-col h-screen bg-[#F8F6F1] dark:bg-[#0A0A0F] overflow-hidden">
        <div className="theme-aware flex items-center justify-between px-5 h-11 border-b border-black/[0.06] dark:border-white/[0.06] bg-[#F2EFE8] dark:bg-[#0A0A0F] flex-shrink-0 z-20">
          <div className="flex items-center gap-3">
            <div className={`theme-aware w-6 h-6 rounded-md ${primaryButton} flex items-center justify-center`}>
              <span className="font-mono text-[9px] font-bold tracking-[-0.05em]">CS</span>
            </div>
            <span className="theme-aware w-px h-3 bg-black/[0.14] dark:bg-white/[0.14]" />
            <span className={`text-sm ${secondaryText}`}>Codebase Storyteller</span>
          </div>

          <div className={`theme-aware flex items-center gap-2 px-3 py-1.5 rounded-lg border ${border} ${raised} hover:${borderStrong} transition-all duration-200 ease-out cursor-default`}>
            <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
            <span className={`mono-data ${primaryText}`}>{workspaceRepoName}</span>
            <span className={`${mutedText} mx-0.5`}>-</span>
            <span className={`mono-data ${mutedText} text-[11px]`}>{nodeCount} files - {edgeCount} imports</span>
          </div>

          <div className="flex items-center gap-1">
          
            <ThemeToggle className="mx-1" />
            <span className="theme-aware w-px h-3 bg-black/[0.14] dark:bg-white/[0.14] mx-1" />
            <button
              type="button"
              onClick={handleNewRepo}
              className={`px-3 py-1.5 rounded-lg border ${border} text-sm ${secondaryText} hover:${primaryText} hover:border-black/[0.14] dark:hover:border-white/[0.14] hover:bg-[#E5E2D8] dark:hover:bg-[#18181F] transition-all duration-200 ease-out`}
            >
              Back to new repo
            </button>
          </div>
        </div>

        <div className="grid flex-1 overflow-hidden" style={{ gridTemplateColumns: "42% 33% 25%" }}>
          <div className={`theme-aware border-r ${border} overflow-hidden`}>
            <GraphPanel />
          </div>
          <div className={`theme-aware border-r ${border} overflow-hidden`}>
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
    <div className="theme-aware min-h-screen bg-[#F8F6F1] dark:bg-[#0A0A0F] flex flex-col">
      <div className={`theme-aware flex items-center justify-between px-8 h-14 border-b ${border} bg-[#F8F6F1] dark:bg-[#0A0A0F] relative z-20`}>
        <div className="flex items-center gap-3">
          <div className={`theme-aware w-8 h-8 rounded-lg ${primaryButton} flex items-center justify-center flex-shrink-0`}>
            <span className="font-mono text-[11px] font-bold tracking-[-0.05em]">CS</span>
          </div>
          <span className="theme-aware w-px h-4 bg-black/[0.14] dark:bg-white/[0.14] mx-1" />
          <span className={`text-md font-medium ${primaryText}`}>Codebase Storyteller</span>
        </div>
        <ThemeToggle />
      </div>

      <main className="flex-1 flex items-center justify-center px-8 pb-16 pt-8">
        <div className="w-full max-w-[1380px] mx-auto grid grid-cols-1 lg:grid-cols-[minmax(400px,500px)_minmax(700px,760px)] gap-10 lg:gap-4 xl:gap-6 items-center justify-center">
          <section>
            <h1 className={`text-display font-semibold ${primaryText} mb-6 animate-fade-up`} style={{ animationDelay: "0.06s" }}>
              Understand <span className="hero-italic">any</span> codebase.
              <br />
              <span className="text-gradient">In minutes.</span>
            </h1>

            <p className={`text-lg ${secondaryText} font-light leading-7 mb-10 max-w-[440px] animate-fade-up`} style={{ animationDelay: "0.12s" }}>
              Paste a GitHub URL. Watch the dependency graph render. Ask the AI anything about the codebase - answers come from your actual code, not hallucination.
            </p>

            <div className="animate-fade-up max-w-[520px]" style={{ animationDelay: "0.18s" }}>
              {!showInput ? (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={(): void => setShowInput(true)}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg ${primaryButton} text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all duration-200 ease-out shadow-float-sm`}
                  >
                    <span>Analyse a repo</span>
                  </button>
                  <button
                    type="button"
                    onClick={fillWithExample}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border ${border} ${secondaryText} text-sm hover:border-black/[0.14] dark:hover:border-white/[0.14] hover:text-[#0F0F12] dark:hover:text-[#F2F2F4] hover:bg-[#E5E2D8] dark:hover:bg-[#18181F] transition-all duration-200 ease-out`}
                  >
                    Try an example
                  </button>
                </div>
              ) : (
                <form onSubmit={handleAnalyse} className={`theme-aware flex items-center rounded-xl border ${border} ${raised} overflow-hidden focus-within:border-black/[0.35] dark:focus-within:border-white/[0.30] focus-within:shadow-focus transition-all duration-200 ease-out`}>
                  <input
                    type="url"
                    placeholder="https://github.com/owner/repo"
                    value={url}
                    onChange={(event: ChangeEvent<HTMLInputElement>): void => setUrl(event.target.value)}
                    required
                    autoFocus
                    className={`flex-1 bg-transparent mono-data ${primaryText} px-4 py-3.5 outline-none placeholder:text-[#8A8A9A] dark:placeholder:text-[#5A5A68] placeholder:font-sans`}
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className={`flex items-center gap-2 px-5 py-3.5 ${primaryButton} text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all duration-200 ease-out border-l ${border} whitespace-nowrap disabled:opacity-40`}
                  >
                    {loading ? <><Spinner tone="dark" />Analysing</> : "Analyse ->"}
                  </button>
                </form>
              )}

              {error && <p className="mt-4 mono-data text-red">{error}</p>}
              {status && !loading && <p className={`mt-3 mono-data ${mutedText}`}>{status}</p>}

              {loading && (
                <div className={`theme-aware mt-6 rounded-lg ${raised} border ${border} overflow-hidden animate-fade-in`}>
                  <div className={`theme-aware flex items-center gap-2 px-4 py-2.5 border-b ${border}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    <span className={`mono-data ${mutedText}`}>ingestion.log</span>
                  </div>
                  <div className="px-4 py-3 space-y-1.5 font-mono text-xs">
                    {STEPS.map((step, index) => {
                      const state = index < currentStep ? "done" : index === currentStep ? "active" : "pending";
                      if (state === "done") {
                        return (
                          <div key={step.label} className={`flex items-center gap-3 ${mutedText} log-line`} style={{ animationDelay: `${index * 0.08}s` }}>
                            <span className="text-green">done</span>
                            <span className={secondaryText}>{step.label}</span>
                            <span className={`ml-auto ${disabledText} mono-data`}>{step.time}</span>
                          </div>
                        );
                      }
                      if (state === "active") {
                        return (
                          <div key={step.label} className={`flex items-center gap-3 ${primaryText} log-line animate-step-activate`} style={{ animationDelay: `${index * 0.08}s` }}>
                            <span className="w-2.5 h-2.5 border border-[#8A8A9A] dark:border-[#5A5A68] border-t-accent rounded-full animate-spin-fast" />
                            <span className={`${primaryText} font-medium`}>{step.label}</span>
                            <span className="ml-auto text-accent mono-data animate-cursor-blink">...</span>
                          </div>
                        );
                      }
                      return (
                        <div key={step.label} className={`flex items-center gap-3 ${disabledText}`}>
                          <span className="opacity-30">{step.icon}</span>
                          <span>{step.label}</span>
                          <span className="ml-auto">-</span>
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
                  className={`mono-data ${mutedText} hover:text-accent cursor-pointer transition-colors duration-200 ease-out underline underline-offset-2 decoration-black/[0.08] dark:decoration-white/[0.08]`}
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
