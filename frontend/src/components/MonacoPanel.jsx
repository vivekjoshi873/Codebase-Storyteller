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

export default function MonacoPanel() {
  const selectedFile = useStore((s) => s.selectedFile);
  const repoId = useStore((s) => s.repoId);
  const [fileContent, setFileContent] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedFile || !repoId) {
      setFileContent("");
      return;
    }

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
  }, [selectedFile, repoId]);

  if (!selectedFile) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <p className="text-sm font-medium text-zinc-300">No file selected</p>
          <p className="mt-1 text-xs text-zinc-500">
            Click a node on the graph, or ask a question that cites a file — the
            viewer opens when the AI mentions [FILE: path].
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-zinc-500">
        Loading {selectedFile}...
      </div>
    );
  }

  return (
    <div className="h-full min-h-0">
      <Editor
        height="100%"
        theme="vs-dark"
        language={languageFromPath(selectedFile)}
        value={fileContent}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily:
            "JetBrains Mono, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
          lineHeight: 21,
          padding: { top: 12 },
          scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
          scrollBeyondLastLine: false,
          wordWrap: "off",
        }}
      />
    </div>
  );
}
