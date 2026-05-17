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
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        {chatMessages.length === 0 && (
          <p className="p-2 text-xs text-zinc-500">
            Analyse a repo, then ask a question about its code.
          </p>
        )}
        {chatMessages.map((message, index) => (
          <div
            key={index}
            className={`max-w-[88%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed ${
              message.role === "user"
                ? "ml-auto bg-teal-700 text-[#e8e8e8]"
                : "mr-auto border border-zinc-700 bg-zinc-900 text-[#e8e8e8]"
            }`}
          >
            {message.text}
          </div>
        ))}
      </div>

      <form
        onSubmit={handleAsk}
        className="flex gap-2 border-t border-zinc-800 p-3"
      >
        <input
          type="text"
          placeholder="Ask about this codebase…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={!repoId}
          className="flex-1 rounded-lg border border-zinc-700 bg-[#0f0f0f] px-3 py-2 text-sm text-[#e8e8e8] outline-none focus:border-emerald-400 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!repoId}
          className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
