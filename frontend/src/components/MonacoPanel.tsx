import { useEffect, useState, type JSX } from "react";
import Editor from "@monaco-editor/react";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useStore } from "../store";

const languageFromPath = (filepath: string): string => {
  if (!filepath) return "plaintext";
  if (filepath.endsWith(".py")) return "python";
  if (filepath.endsWith(".ts") || filepath.endsWith(".tsx")) return "typescript";
  if (filepath.endsWith(".js") || filepath.endsWith(".jsx")) return "javascript";
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

  useEffect((): void => {
    if (!selectedFile || !repoId) {
      setFileContent("");
      return;
    }

    const cached = getCachedFile(selectedFile);
    if (cached !== undefined) {
      setFileContent(cached);
      setLoading(false);
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
        cacheFile(selectedFile, text);
        setFileContent(text);
      })
      .catch(() => setFileContent("// Unable to load file content"))
      .finally(() => setLoading(false));
  }, [selectedFile, repoId, getCachedFile, cacheFile]);

  const handleBeforeMount: BeforeMount = (monaco): void => {
    monaco.editor.defineTheme("editorial-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "444444", fontStyle: "italic" },
        { token: "keyword", foreground: "E8FF8B" },
        { token: "string", foreground: "A8FF78" },
        { token: "number", foreground: "F5F5F5" },
      ],
      colors: {
        "editor.background": "#0A0A0A",
        "editor.foreground": "#94A3B8",
        "editor.lineHighlightBackground": "#111111",
        "editor.selectionBackground": "rgba(232,255,139,0.1)",
        "editorLineNumber.foreground": "#252525",
        "editorLineNumber.activeForeground": "#555555",
        "editorCursor.foreground": "#E8FF8B",
        "editor.inactiveSelectionBackground": "#1A1A1A",
        "editorIndentGuide.background": "#1A1A1A",
        "editorIndentGuide.activeBackground": "#2A2A2A",
      },
    });
  };

  const handleEditorMount: OnMount = (editorInstance: editor.IStandaloneCodeEditor, monaco): void => {
    void editorInstance;
    monaco.editor.setTheme("editorial-dark");
  };

  const { name: fileName, ext: fileExt } = getFileInfo(selectedFile);

  if (!selectedFile) {
    return (
      <div className="flex flex-col h-full bg-canvas">
        <div className="flex items-center justify-between px-5 h-11 border-b border-[#222222] flex-shrink-0 bg-[#0A0A0A]">
          <span className="text-label text-ink-muted tracking-widest uppercase">CODE VIEWER</span>
          <span className="text-label text-ink-muted">-</span>
        </div>
        <div className="flex flex-col justify-center h-full px-6">
          <p className="text-label text-ink-muted tracking-widest uppercase mb-4">No file selected</p>
          <p className="text-sm text-ink-secondary leading-relaxed max-w-[160px]">Click a node on the graph, or ask a question.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-canvas">
      <div className="flex items-center justify-between px-5 h-11 border-b border-[#222222] flex-shrink-0 bg-[#0A0A0A]">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-ink-primary">{fileName}</span>
          {fileExt && <span className="font-mono text-[10px] text-ink-muted border border-border px-1.5 py-0.5">{fileExt}</span>}
        </div>
        <span className="font-mono text-[10px] text-ink-muted truncate max-w-[100px]" title={selectedFile}>
          {selectedFile}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-full text-sm text-ink-muted font-mono">Loading {fileName}...</div>
      ) : (
        <div className="flex-1">
          <Editor
            height="100%"
            beforeMount={handleBeforeMount}
            onMount={handleEditorMount}
            theme="editorial-dark"
            language={languageFromPath(selectedFile)}
            value={fileContent}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 12,
              lineHeight: 22,
              fontFamily: "'JetBrains Mono', monospace",
              fontLigatures: true,
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              cursorBlinking: "smooth",
              renderLineHighlight: "line",
              padding: { top: 16, bottom: 16 },
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              scrollbar: {
                verticalScrollbarSize: 3,
                horizontalScrollbarSize: 3,
              },
            }}
          />
        </div>
      )}
    </div>
  );
};

export default MonacoPanel;
