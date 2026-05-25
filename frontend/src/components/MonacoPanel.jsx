import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { useStore } from "../store";

function languageFromPath(filepath) {
  if (!filepath) return "plaintext";
  if (filepath.endsWith(".py")) return "python";
  if (filepath.endsWith(".ts") || filepath.endsWith(".tsx")) return "typescript";
  if (filepath.endsWith(".js") || filepath.endsWith(".jsx")) return "javascript";
  return "plaintext";
}

function getFileInfo(filepath) {
  if (!filepath) return { name: "", ext: "" };
  const parts = filepath.split("/");
  const name = parts[parts.length - 1] || "";
  const extMatch = name.match(/\.(\w+)$/);
  return { name, ext: extMatch ? extMatch[1] : "" };
}

export default function MonacoPanel() {
  const selectedFile = useStore((s) => s.selectedFile);
  const repoId = useStore((s) => s.repoId);
  const [fileContent, setFileContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    if (!selectedFile || !repoId) {
      setFileContent("");
      return;
    }

    setOpacity(0);
    const fadeTimer = setTimeout(() => setOpacity(1), 150);

    const params = new URLSearchParams({
      repo_id: repoId,
      filepath: selectedFile,
    });

    setLoading(true);
    fetch(`/api/file?${params.toString()}`)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load file");
        return response.text();
      })
      .then((text) => setFileContent(text))
      .catch(() => setFileContent("// Unable to load file content"))
      .finally(() => setLoading(false));

    return () => clearTimeout(fadeTimer);
  }, [selectedFile, repoId]);

  const isLight = document.documentElement.getAttribute("data-theme") === "light";

  const handleBeforeMount = (monaco) => {
    monaco.editor.defineTheme("codebase-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#0E1220",
        "editor.lineHighlightBackground": "#151929",
        "editorLineNumber.foreground": "#475569",
        "editorLineNumber.activeForeground": "#6EE7B7",
        "editor.selectionBackground": "rgba(110,231,183,0.15)",
        "editorCursor.foreground": "#6EE7B7",
      },
    });
    monaco.editor.defineTheme("codebase-light", {
      base: "vs",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#FFFFFF",
        "editor.lineHighlightBackground": "#F1F5F9",
        "editorLineNumber.foreground": "#94A3B8",
        "editorLineNumber.activeForeground": "#059669",
        "editor.selectionBackground": "rgba(5,150,105,0.15)",
        "editorCursor.foreground": "#059669",
      },
    });
  };

  const { name: fileName, ext: fileExt } = getFileInfo(selectedFile);

  if (!selectedFile) {
    return (
      <div className="flex flex-col h-full bg-surface">
        <div className="flex items-center justify-between px-4 h-9 border-b border-border-subtle flex-shrink-0">
          <span className="text-[10px] tracking-widest text-text-muted uppercase">
            CODE VIEWER
          </span>
          <span className="text-[10px] text-text-muted">No file selected</span>
        </div>
        <div className="flex flex-col items-center justify-center h-full text-center px-6">
          <span className="text-3xl text-text-muted mb-3 opacity-40">
            &lt;/&gt;
          </span>
          <p className="text-sm text-text-secondary mb-1">No file selected</p>
          <p className="text-xs text-text-muted leading-relaxed max-w-[180px]">
            Click a node on the graph, or ask a question — files open here
            automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="flex items-center justify-between px-4 h-9 border-b border-border-subtle flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-primary font-mono">
            {fileName}
          </span>
          {fileExt && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-overlay border border-border-subtle text-text-muted">
              {fileExt}
            </span>
          )}
        </div>
        <span
          className="text-[10px] font-mono text-text-muted truncate max-w-[120px]"
          title={selectedFile}
        >
          {selectedFile}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-full text-sm text-text-muted">
          Loading {fileName}...
        </div>
      ) : (
        <div
          className="flex-1 transition-opacity duration-150"
          style={{ opacity }}
        >
          <Editor
            height="100%"
            beforeMount={handleBeforeMount}
            theme={isLight ? "codebase-light" : "codebase-dark"}
            language={languageFromPath(selectedFile)}
            value={fileContent}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 12,
              lineHeight: 20,
              fontFamily: "'JetBrains Mono', monospace",
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              cursorBlinking: "smooth",
              renderLineHighlight: "line",
              padding: { top: 12 },
            }}
          />
        </div>
      )}
    </div>
  );
}
