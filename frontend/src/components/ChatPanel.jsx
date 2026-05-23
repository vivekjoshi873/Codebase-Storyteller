import { useState } from "react";
import { useStore } from "../store";

export default function ChatPanel() {
  const [question, setQuestion] = useState("");

  const repoId = useStore((s) => s.repoId);
  const chatMessages = useStore((s) => s.chatMessages);
  const appendMessage = useStore((s) => s.appendMessage);
  const updateLastMessage = useStore((s) => s.updateLastMessage);
  const setActiveNodes = useStore((s) => s.setActiveNodes);

  const handleAsk = (event) => {
    event.preventDefault();
    if (!question.trim() || !repoId) return;

    const q = question.trim();
    setQuestion("");

    appendMessage({ role: "user", text: q });
    appendMessage({ role: "assistant", text: "" });

    const params = new URLSearchParams({ q, repo_id: repoId });
    const source = new EventSource(`/api/query?${params.toString()}`);

    source.onmessage = (event) => {
      updateLastMessage(event.data);
    };

    source.addEventListener("highlight", (event) => {
      setActiveNodes([event.data]);
    });

    source.onerror = () => {
      source.close();
    };
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {chatMessages.length === 0 && (
          <div className="rounded-md border border-dashed border-zinc-800 bg-zinc-950/50 p-4">
            <p className="text-sm font-medium text-zinc-300">Ask about the codebase</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Once a repo is analysed, questions are answered from retrieved code chunks
              and cited files will pulse in the graph.
            </p>
          </div>
        )}

        {chatMessages.map((message, index) => (
          <div
            key={index}
            className={`max-w-[90%] whitespace-pre-wrap rounded-md px-3 py-2 text-sm leading-6 shadow-sm ${
              message.role === "user"
                ? "ml-auto bg-emerald-500 text-zinc-950"
                : "mr-auto border border-zinc-800 bg-zinc-950 text-zinc-200"
            }`}
          >
            {message.text || (
              <span className="text-zinc-500">Thinking...</span>
            )}
          </div>
        ))}
      </div>

      <form
        onSubmit={handleAsk}
        className="flex gap-2 border-t border-zinc-800 bg-zinc-950/60 p-3"
      >
        <input
          type="text"
          placeholder={repoId ? "Ask where something happens..." : "Analyse a repo first"}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={!repoId}
          className="h-10 min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/15 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!repoId || !question.trim()}
          className="h-10 rounded-md bg-zinc-100 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
