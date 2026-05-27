import { useEffect, useRef, useState, type JSX } from "react";
import Editor from "@monaco-editor/react";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useStore } from "../store";
import { useTheme } from "@/hooks/useTheme";

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

const defineThemes = (monaco: typeof import("monaco-editor")): void => {
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
      "editor.lineHighlightBorder": "#111118",
      "editor.selectionBackground": "rgba(232,168,56,0.15)",
      "editor.inactiveSelectionBackground": "#111118",
      "editorLineNumber.foreground": "#1F1F28",
      "editorLineNumber.activeForeground": "#3D3D4A",
      "editorCursor.foreground": "#E8A838",
      "editorIndentGuide.background1": "#111118",
      "editorIndentGuide.activeBackground1": "#18181F",
      "editorWhitespace.foreground": "#18181F",
      "editorBracketMatch.background": "rgba(232,168,56,0.08)",
      "editorBracketMatch.border": "rgba(232,168,56,0.30)",
      "scrollbar.shadow": "#050507",
      "scrollbarSlider.background": "rgba(255,255,255,0.05)",
      "scrollbarSlider.hoverBackground": "rgba(255,255,255,0.09)",
      "scrollbarSlider.activeBackground": "rgba(255,255,255,0.13)",
    },
  });

  monaco.editor.defineTheme("parchment", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "", foreground: "2A2A38" },
      { token: "comment", foreground: "A0A0B0", fontStyle: "italic" },
      { token: "keyword", foreground: "B85C00", fontStyle: "bold" },
      { token: "keyword.control", foreground: "B85C00" },
      { token: "string", foreground: "2D7A4A" },
      { token: "string.escape", foreground: "2D7A4A" },
      { token: "number", foreground: "0F0F12" },
      { token: "type", foreground: "5050D0" },
      { token: "class", foreground: "B85C00" },
      { token: "function", foreground: "0F0F12" },
      { token: "variable", foreground: "4A4A58" },
      { token: "parameter", foreground: "7A5C20" },
      { token: "operator", foreground: "A0A0B0" },
      { token: "delimiter", foreground: "A0A0B0" },
    ],
    colors: {
      "editor.background": "#F2EFE8",
      "editor.foreground": "#2A2A38",
      "editor.lineHighlightBackground": "#E8E5DC",
      "editor.lineHighlightBorder": "#DEDAD0",
      "editor.selectionBackground": "rgba(184,92,0,0.12)",
      "editor.inactiveSelectionBackground": "#DED8CC",
      "editorLineNumber.foreground": "#C8C4B8",
      "editorLineNumber.activeForeground": "#A0A0B0",
      "editorCursor.foreground": "#B85C00",
      "editorIndentGuide.background1": "#DEDAD0",
      "editorIndentGuide.activeBackground1": "#C8C4B8",
      "editorWhitespace.foreground": "#D8D4C8",
      "editorBracketMatch.background": "rgba(184,92,0,0.08)",
      "editorBracketMatch.border": "rgba(184,92,0,0.25)",
      "scrollbar.shadow": "#F2EFE8",
      "scrollbarSlider.background": "rgba(0,0,0,0.08)",
      "scrollbarSlider.hoverBackground": "rgba(0,0,0,0.12)",
      "scrollbarSlider.activeBackground": "rgba(0,0,0,0.18)",
    },
  });
};

const MonacoPanel = (): JSX.Element => {
  const selectedFile = useStore((s) => s.selectedFile);
  const repoId = useStore((s) => s.repoId);
  const getCachedFile = useStore((s) => s.getCachedFile);
  const cacheFile = useStore((s) => s.cacheFile);
  const { isDark } = useTheme();
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [opacity, setOpacity] = useState<number>(1);

  useEffect((): void => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(isDark ? "void-dark" : "parchment");
    }
  }, [isDark]);

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
    defineThemes(monaco);
  };

  const handleEditorMount: OnMount = (editorInstance: editor.IStandaloneCodeEditor, monaco): void => {
    monacoRef.current = monaco;
    editorInstance.updateOptions({ readOnly: true });
    monaco.editor.setTheme(isDark ? "void-dark" : "parchment");
  };

  const handleCopyPath = async (): Promise<void> => {
    if (!selectedFile) return;
    await navigator.clipboard.writeText(selectedFile);
  };

  const { name: fileName, ext: fileExt } = getFileInfo(selectedFile);

  if (!selectedFile) {
    return (
      <div className="theme-aware flex flex-col h-full bg-[#F2EFE8] dark:bg-[#050507]">
        <div className="theme-aware flex items-center justify-between h-10 px-5 bg-[#E8E5DC] dark:bg-[#0A0A0F] border-b border-black/[0.08] dark:border-white/[0.06] flex-shrink-0">
          <span className="eyebrow text-[#8A8A9A] dark:text-[#5A5A68]">CODE VIEWER</span>
          <span className="eyebrow text-[#C0C0CC] dark:text-[#36363F]">-</span>
        </div>
        <div className="flex flex-col justify-center h-full px-6">
          <p className="eyebrow text-[#8A8A9A] dark:text-[#5A5A68] mb-3">NO FILE SELECTED</p>
          <p className="text-sm text-[#8A8A9A] dark:text-[#5A5A68] leading-relaxed max-w-[160px] transition-colors duration-200 ease-out">
            Click a node on the graph. Files cited by the AI open here automatically.
          </p>
          <div className="mt-6 flex items-center gap-2">
            <span className="text-[11px] text-[#C0C0CC] dark:text-[#36363F]">Or press</span>
            <kbd className="mono-data text-[10px] px-1.5 py-0.5 rounded bg-[#DEDAD0] dark:bg-[#18181F] border border-black/[0.08] dark:border-white/[0.06] text-[#8A8A9A] dark:text-[#5A5A68]">Cmd K</kbd>
            <span className="text-[11px] text-[#C0C0CC] dark:text-[#36363F]">to search files</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="theme-aware flex flex-col h-full bg-[#F2EFE8] dark:bg-[#050507]">
      <div className="theme-aware flex items-center justify-between h-10 px-5 bg-[#E8E5DC] dark:bg-[#0A0A0F] border-b border-black/[0.08] dark:border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="mono-data text-sm text-[#0F0F12] dark:text-[#F2F2F4] truncate transition-colors duration-200 ease-out">{fileName}</span>
          {fileExt && (
            <span className="mono-data text-[10px] text-[#8A8A9A] dark:text-[#5A5A68] border border-black/[0.08] dark:border-white/[0.06] rounded px-1.5 py-0.5 bg-[#DEDAD0] dark:bg-[#18181F] transition-colors duration-200 ease-out">
              .{fileExt}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 min-w-0">
          <span className="mono-data text-[11px] text-[#8A8A9A] dark:text-[#5A5A68] truncate max-w-[130px] transition-colors duration-200 ease-out" title={selectedFile}>{selectedFile}</span>
          <button
            type="button"
            onClick={(): void => {
              void handleCopyPath();
            }}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#DEDAD0] dark:hover:bg-[#18181F] text-[#8A8A9A] dark:text-[#5A5A68] hover:text-[#4A4A58] dark:hover:text-[#9B9BA8] transition-all duration-200 ease-out cursor-pointer"
            aria-label="Copy file path"
          >
            copy
          </button>
        </div>
      </div>

      <div className="flex-1 transition-opacity" style={{ opacity, transitionDuration: "120ms" }}>
        {loading ? (
          <div className="flex items-center justify-center h-full text-sm text-[#8A8A9A] dark:text-[#5A5A68] font-mono">Loading {fileName}...</div>
        ) : (
          <Editor
            height="100%"
            beforeMount={handleBeforeMount}
            onMount={handleEditorMount}
            theme={isDark ? "void-dark" : "parchment"}
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
