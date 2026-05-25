import { useState, useEffect, useMemo, useCallback } from "react";
import GraphPanel from "./components/GraphPanel";
import ChatPanel from "./components/ChatPanel";
import MonacoPanel from "./components/MonacoPanel";
import { useStore } from "./store";

function SunIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function ThemeToggle({ theme, onToggle, sweeping }) {
  return (
    <button
      onClick={onToggle}
      disabled={sweeping}
      className="w-8 h-8 rounded-lg bg-elevated border border-border-subtle flex items-center justify-center text-text-secondary hover:text-mint hover:border-border-strong transition-all duration-200 disabled:pointer-events-none"
      title={theme === "dark" ? "Switch to light" : "Switch to dark"}
    >
      <span className={`transition-transform duration-500 ${sweeping ? "rotate-[360deg] scale-0" : "rotate-0 scale-100"}`}>
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </span>
    </button>
  );
}

const POLL_INTERVAL_MS = 2000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const STEPS = [
  "Cloning repository",
  "Building dependency graph",
  "Embedding code chunks",
  "Storing vectors",
];

const FEATURES = [
  {
    icon: "◈",
    title: "Dependency Graph",
    body: "Every file as a node. Every import as an edge. Explore architecture visually.",
  },
  {
    icon: "◎",
    title: "AI Narration",
    body: "GPT-4o streams a plain-English walkthrough synced to the graph in real time.",
  },
  {
    icon: "⬡",
    title: "RAG-Powered Q&A",
    body: "Ask anything. ChromaDB retrieves exact code chunks before the AI answers.",
  },
];

export default function App() {
  const [view, setView] = useState("landing");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [theme, setTheme] = useState(() => localStorage.getItem("cs-theme") || "dark");
  const [sweeping, setSweeping] = useState(false);
  const [sweepColor, setSweepColor] = useState(null);

  const repoId = useStore((s) => s.repoId);
  const graphData = useStore((s) => s.graphData);
  const setRepoId = useStore((s) => s.setRepoId);
  const setGraphData = useStore((s) => s.setGraphData);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, []);

  const toggleTheme = useCallback(() => {
    if (sweeping) return;
    const next = theme === "dark" ? "light" : "dark";
    const currentColor = theme === "dark" ? "#080B14" : "#F8FAFC";
    setSweepColor(currentColor);
    setSweeping(true);

    requestAnimationFrame(() => {
      setTheme(next);
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("cs-theme", next);
    });

    setTimeout(() => {
      setSweeping(false);
      setSweepColor(null);
    }, 650);
  }, [theme, sweeping]);

  const repoName = useMemo(() => {
    try {
      return new URL(url).pathname.replace(/^\//, "").replace(/\.git$/, "");
    } catch {
      return url || "repository";
    }
  }, [url]);

  const particles = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        id: i,
        size: Math.random() > 0.5 ? "w-2 h-2" : "w-1 h-1",
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        delay: `${Math.random() * 4}s`,
        duration: `${3 + Math.random() * 3}s`,
      })),
    [],
  );

  useEffect(() => {
    if (!loading) {
      setCurrentStep(0);
      return;
    }
    const interval = setInterval(() => {
      setCurrentStep((prev) => Math.min(prev + 1, 3));
    }, 8000);
    return () => clearInterval(interval);
  }, [loading]);

  const pollRepoStatus = async (id) => {
    while (true) {
      const response = await fetch(`/api/repo/${id}`);

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(
          payload.detail || payload.error || "Status check failed",
        );
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

      setStatus(
        "Analysing in background... cloning, parsing, embedding, and storing chunks.",
      );
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
        setView("workspace");
        return;
      }

      setStatus("Analysis started. Waiting for the backend to finish...");
      await pollRepoStatus(data.repo_id);
      setView("workspace");
    } catch (err) {
      setError(err.message);
      setStatus("");
    } finally {
      setLoading(false);
    }
  };

  const handleNewRepo = () => {
    setView("landing");
    setUrl("");
    setError("");
    setStatus("");
    setLoading(false);
    useStore.setState({
      repoId: null,
      graphData: { nodes: [], edges: [] },
      activeNodes: [],
      selectedFile: null,
      chatMessages: [],
      fileCache: {},
    });
  };

  if (view === "workspace") {
    return (
      <div className="flex flex-col h-screen bg-base overflow-hidden">
        {sweeping && (
          <div
            className="fixed inset-0 z-[100] animate-theme-sweep"
            style={{ backgroundColor: sweepColor }}
          />
        )}
        <div className="flex items-center justify-between px-4 h-10 bg-surface border-b border-border-subtle flex-shrink-0">
          <span className="font-mono text-xs text-text-muted tracking-wider">
            CODEBASE STORYTELLER
          </span>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-elevated border border-border-subtle text-xs font-mono text-text-secondary">
            <span className="w-1.5 h-1.5 rounded-full bg-mint animate-pulse" />
            {repoName}
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle theme={theme} onToggle={toggleTheme} sweeping={sweeping} />
            <button
              onClick={handleNewRepo}
              className="text-xs text-text-muted hover:text-text-primary transition-colors duration-150 cursor-pointer"
            >
              ← New repo
            </button>
          </div>
        </div>

        <div
          className="grid h-[calc(100vh-40px)]"
          style={{ gridTemplateColumns: "42% 33% 25%" }}
        >
          <GraphPanel />
          <ChatPanel />
          <MonacoPanel key={theme} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-base px-6 text-center">
      {sweeping && (
        <div
          className="fixed inset-0 z-[100] animate-theme-sweep"
          style={{ backgroundColor: sweepColor }}
        />
      )}

      <div className="absolute top-4 right-6 z-20">
        <ThemeToggle theme={theme} onToggle={toggleTheme} sweeping={sweeping} />
      </div>

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((p) => (
          <div
            key={p.id}
            className={`absolute rounded-full bg-mint opacity-10 animate-float ${p.size}`}
            style={{
              top: p.top,
              left: p.left,
              animationDelay: p.delay,
              animationDuration: p.duration,
            }}
          />
        ))}
      </div>

      <h1
        className="text-5xl md:text-7xl font-bold leading-tight tracking-tight mb-6 animate-fade-up"
        style={{ animationDelay: "0.1s" }}
      >
        Understand any codebase
        <br />
        <span className="text-gradient">in minutes, not weeks.</span>
      </h1>

      <p
        className="text-text-secondary text-lg max-w-lg mx-auto mb-10 leading-relaxed animate-fade-up"
        style={{ animationDelay: "0.2s" }}
      >
        Paste a GitHub repo URL. Watch the dependency graph build in real time.
        Ask the AI anything about the code.
      </p>

      <div
        className="w-full max-w-2xl mx-auto mb-6 animate-fade-up"
        style={{ animationDelay: "0.3s" }}
      >
        <form
          onSubmit={handleAnalyse}
          className="flex items-center gap-2 p-2 rounded-2xl bg-elevated border border-border-default focus-within:border-border-strong focus-within:shadow-glow-focus transition-all duration-300"
        >
          <input
            type="url"
            placeholder="https://github.com/owner/repo"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            className="flex-1 bg-transparent text-text-primary font-mono text-sm px-3 py-2 outline-none placeholder:text-text-muted"
          />
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-mint text-[#080B14] font-semibold text-sm hover:brightness-110 active:scale-95 transition-all duration-150 whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-[#080B14] border-t-transparent animate-spin-slow" />
                Analysing...
              </>
            ) : (
              "Analyse →"
            )}
          </button>
        </form>
      </div>

      {error && (
        <div className="w-full max-w-2xl mx-auto mb-4 px-4 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm text-center animate-fade-up">
          {error}
        </div>
      )}

      {loading && (
        <div className="w-full max-w-2xl mx-auto mb-8 space-y-2">
          {STEPS.map((step, i) => {
            const state =
              i < currentStep ? "done" : i === currentStep ? "active" : "pending";

            if (state === "done") {
              return (
                <div
                  key={step}
                  className="flex items-center gap-3 text-sm text-text-secondary animate-progress-in"
                  style={{ animationDelay: `${i * 0.15}s` }}
                >
                  <span className="text-mint">✓</span>
                  <span className="line-through">{step}</span>
                </div>
              );
            }

            if (state === "active") {
              return (
                <div
                  key={step}
                  className="flex items-center gap-3 text-sm text-text-primary animate-progress-in font-medium"
                  style={{ animationDelay: `${i * 0.15}s` }}
                >
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-border-default border-t-mint animate-spin-slow" />
                  {step}
                </div>
              );
            }

            return (
              <div
                key={step}
                className="flex items-center gap-3 text-sm text-text-muted"
              >
                <span>○</span>
                <span>{step}</span>
              </div>
            );
          })}
        </div>
      )}

      <div
        className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl mx-auto mb-8 animate-fade-up"
        style={{ animationDelay: "0.4s" }}
      >
        {FEATURES.map((card) => (
          <div
            key={card.title}
            className="group p-5 rounded-2xl bg-elevated border border-border-subtle hover:border-border-strong hover:-translate-y-1 hover:shadow-card transition-all duration-200 text-left cursor-default"
          >
            <span className="text-mint text-2xl mb-3 block">{card.icon}</span>
            <h3 className="text-text-primary font-semibold text-sm mb-2">
              {card.title}
            </h3>
            <p className="text-text-secondary text-xs leading-relaxed">
              {card.body}
            </p>
          </div>
        ))}
      </div>

      <p
        className="text-text-muted text-xs animate-fade-up"
        style={{ animationDelay: "0.5s" }}
      >
        Works with any public GitHub repo · Python · TypeScript · JavaScript
      </p>
    </div>
  );
}
