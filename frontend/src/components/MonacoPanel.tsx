import { useEffect, useState, type JSX } from "react";
import Editor from "@monaco-editor/react";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useStore } from "../store";

const FILE_TRANSITION_MS = 120;

const languageFromPath = (filepath: string): string => {
  if (!filepath) return "plaintext";
  if (filepath.endsWith(".py")) return "python";
  if (filepath.endsWith(".ts") || filepath.endsWith(".tsx")) return "typescript";
  if (filepath.endsWith(".js") || filepath.endsWith(".jsx")) return "javascript";
  if (filepath.endsWith(".go")) return "go";
  if (filepath.endsWith(".json")) return "json";
  if (filepath.endsWith(".md")) return "markdown";
  return "plaintext";
};

const getFileInfo = (filepath: string | null): { name: string; ext: string } => {
  if (!filepath) return { name: "", ext: "" };
  const parts = filepath.split("/");
  const name = parts[parts.length - 1] || "";
  const extMatch = name.match(/\.(\w+)$/);
  return { name, ext: extMatch ? extMatch[1] : "" };
};

const MonacoPanel = (): JSX.Element => {
  const selectedFile = useStore((s) => s.selectedFile);
  const repoId = useStore((s) => s.repoId);
  const getCachedFile = useStore((s) => s.getCachedFile);
  const cacheFile = useStore((s) => s.cacheFile);
  const [fileContent, setFileContent] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [opacity, setOpacity] = useState<number>(1);

  useEffect((): (() => void) | void => {
    if (!selectedFile || !repoId) {
      setFileContent("");
      setLoading(false);
      setOpacity(1);
      return;
    }

    let cancelled = false;
    setOpacity(0);

    const timeout = window.setTimeout((): void => {
      if (cancelled) return;

      const cached = getCachedFile(selectedFile);
      if (cached !== undefined) {
        setFileContent(cached);
        setLoading(false);
        setOpacity(1);
        return;
      }

      const params = new URLSearchParams({ repo_id: repoId, filepath: selectedFile });

      setLoading(true);
      fetch(`/api/file?${params.toString()}`)
        .then((response: Response) => {
          if (!response.ok) throw new Error("Failed to load file");
          return response.text();
        })
        .then((text: string) => {
          if (cancelled) return;
          cacheFile(selectedFile, text);
          setFileContent(text);
        })
        .catch(() => {
          if (cancelled) return;
          setFileContent("// Unable to load file content");
        })
        .finally(() => {
          if (cancelled) return;
          setLoading(false);
          setOpacity(1);
        });
    }, FILE_TRANSITION_MS);

    return (): void => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [selectedFile, repoId, getCachedFile, cacheFile]);

  const handleBeforeMount: BeforeMount = (monaco): void => {
    monaco.editor.defineTheme("void-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "", foreground: "9B9BA8" },
        { token: "comment", foreground: "3D3D4A", fontStyle: "italic" },
        { token: "keyword", foreground: "E8A838", fontStyle: "bold" },
        { token: "keyword.control", foreground: "E8A838" },
        { token: "string", foreground: "3DD68C" },
        { token: "string.escape", foreground: "3DD68C" },
        { token: "number", foreground: "F2F2F4" },
        { token: "type", foreground: "7C7CFA" },
        { token: "class", foreground: "E8A838" },
        { token: "function", foreground: "F2F2F4" },
        { token: "variable", foreground: "9B9BA8" },
        { token: "parameter", foreground: "C0A060" },
        { token: "operator", foreground: "5A5A68" },
        { token: "delimiter", foreground: "3D3D4A" },
      ],
      colors: {
        "editor.background": "#050507",
        "editor.foreground": "#9B9BA8",
        "editor.lineHighlightBackground": "#0A0A0F",
        "editor.lineHighlightBorderColor": "#111118",
        "editor.selectionBackground": "rgba(232,168,56,0.15)",
        "editor.inactiveSelectionBackground": "#111118",
        "editorLineNumber.foreground": "#1F1F28",
        "editorLineNumber.activeForeground": "#3D3D4A",
        "editorCursor.foreground": "#E8A838",
        "editorIndentGuide.background": "#111118",
        "editorIndentGuide.activeBackground": "#18181F",
        "editorWhitespace.foreground": "#18181F",
        "editorBracketMatch.background": "rgba(232,168,56,0.08)",
        "editorBracketMatch.border": "rgba(232,168,56,0.30)",
        "scrollbar.shadow": "#050507",
        "scrollbarSlider.background": "rgba(255,255,255,0.05)",
        "scrollbarSlider.hoverBackground": "rgba(255,255,255,0.09)",
        "scrollbarSlider.activeBackground": "rgba(255,255,255,0.13)",
      },
    });
  };

  const handleEditorMount: OnMount = (editorInstance: editor.IStandaloneCodeEditor, monaco): void => {
    editorInstance.updateOptions({ readOnly: true });
    monaco.editor.setTheme("void-dark");
  };

  const handleCopyPath = async (): Promise<void> => {
    if (!selectedFile) return;
    await navigator.clipboard.writeText(selectedFile);
  };

  const { name: fileName, ext: fileExt } = getFileInfo(selectedFile);

  if (!selectedFile) {
    return (
      <div className="flex flex-col h-full bg-void">
        <div className="panel-header bg-void">
          <span className="eyebrow">CODE VIEWER</span>
          <span className="eyebrow text-ink-disabled">—</span>
        </div>
        <div className="flex flex-col justify-center h-full px-6">
          <p className="eyebrow mb-3">NO FILE SELECTED</p>
          <p className="text-sm text-ink-muted leading-relaxed max-w-[160px]">
            Click a node on the graph. Files cited by the AI open here automatically.
          </p>
          <div className="mt-6 flex items-center gap-2">
            <span className="text-[11px] text-ink-disabled">Or press</span>
            <kbd className="mono-data text-[10px] px-1.5 py-0.5 rounded bg-raised border border-line text-ink-muted">⌘K</kbd>
            <span className="text-[11px] text-ink-disabled">to search files</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-void">
      <div className="panel-header bg-void">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="mono-data text-sm text-ink-primary truncate">{fileName}</span>
          {fileExt && <span className="mono-data text-[10px] text-ink-muted border border-line rounded px-1.5 py-0.5 bg-raised">.{fileExt}</span>}
        </div>
        <div className="flex items-center gap-3 min-w-0">
          <span className="mono-data text-[11px] text-ink-muted truncate max-w-[130px]" title={selectedFile}>{selectedFile}</span>
          <button
            type="button"
            onClick={(): void => {
              void handleCopyPath();
            }}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-raised text-ink-muted hover:text-ink-secondary transition-all duration-100 cursor-pointer"
            aria-label="Copy file path"
          >
            ⎘
          </button>
        </div>
      </div>

      <div className="flex-1 transition-opacity" style={{ opacity, transitionDuration: "120ms" }}>
        {loading ? (
          <div className="flex items-center justify-center h-full text-sm text-ink-muted font-mono">Loading {fileName}...</div>
        ) : (
          <Editor
            height="100%"
            beforeMount={handleBeforeMount}
            onMount={handleEditorMount}
            theme="void-dark"
            language={languageFromPath(selectedFile)}
            value={fileContent}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 12,
              lineHeight: 22,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontLigatures: true,
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              cursorBlinking: "smooth",
              cursorStyle: "line",
              renderLineHighlight: "line",
              padding: { top: 16, bottom: 24 },
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              renderWhitespace: "none",
              scrollbar: {
                verticalScrollbarSize: 3,
                horizontalScrollbarSize: 3,
                vertical: "auto",
                horizontal: "auto",
              },
              suggest: { showKeywords: false },
            }}
          />
        )}
      </div>
    </div>
  );
};

export default MonacoPanel;
