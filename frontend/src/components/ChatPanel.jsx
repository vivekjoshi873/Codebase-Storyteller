import { useState } from "react";
import { useStore } from "../store";

export default function ChatPanel() {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  const repoId = useStore((s) => s.repoId);
  const chatMessages = useStore((s) => s.chatMessages);
  const appendMessage = useStore((s) => s.appendMessage);
  const updateLastMessage = useStore((s) => s.updateLastMessage);
  const setLastAssistantMessage = useStore((s) => s.setLastAssistantMessage);
  const setActiveNodes = useStore((s) => s.setActiveNodes);
  const setSelectedFile = useStore((s) => s.setSelectedFile);

  const handleAsk = (event) => {
    event.preventDefault();
    if (!question.trim() || !repoId || asking) return;

    const q = question.trim();
    setQuestion("");
    setAsking(true);

    appendMessage({ role: "user", text: q });
    appendMessage({ role: "assistant", text: "" });

    const params = new URLSearchParams({ q, repo_id: repoId });
    const source = new EventSource(`/api/query?${params.toString()}`);

    const finish = () => {
      source.close();
      setAsking(false);
    };

    source.addEventListener("message", (e) => {
      updateLastMessage(e.data);
    });

    source.addEventListener("highlight", (e) => {
      const filepath = e.data?.trim();
      if (!filepath) return;
      setActiveNodes([filepath]);
      setSelectedFile(filepath);
    });

    source.addEventListener("error", (e) => {
      setLastAssistantMessage(e.data);
      finish();
    });

    source.addEventListener("done", () => {
      finish();
    });

    source.onerror = () => {
      const messages = useStore.getState().chatMessages;
      const last = messages[messages.length - 1];
      if (last?.role === "assistant" && !last.text?.trim()) {
        setLastAssistantMessage(
          "Connection lost. Check that the backend is running on port 8000 and OPENAI_API_KEY is set in .env.",
        );
      }
      finish();
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
              and cited files will pulse on the graph and open here.
            </p>
          </div>
        )}

        {chatMessages.map((message, index) => (
          <div
            key={index}
            className={`max-w-[90%] whitespace-pre-wrap rounded-md px-3 py-2 text-sm leading-6 shadow-sm ${
              message.role === "user"
                ? "ml-auto bg-emerald-500 text-zinc-950"
                : message.text?.startsWith("OpenAI") ||
                    message.text?.startsWith("OPENAI") ||
                    message.text?.startsWith("Could not") ||
                    message.text?.startsWith("Connection lost")
                  ? "mr-auto border border-red-500/40 bg-red-950/40 text-red-200"
                  : "mr-auto border border-zinc-800 bg-zinc-950 text-zinc-200"
            }`}
          >
            {message.text || (
              <span className="text-zinc-500">Searching codebase…</span>
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
          disabled={!repoId || asking}
          className="h-10 min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/15 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!repoId || !question.trim() || asking}
          className="h-10 rounded-md bg-zinc-100 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {asking ? "Asking…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
