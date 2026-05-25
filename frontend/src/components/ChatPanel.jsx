import { useState, useRef, useEffect } from "react";
import { useStore } from "../store";

const SUGGESTIONS = [
  "How is this codebase structured?",
  "What handles error cases?",
  "Where does the main logic live?",
];

function parseInline(text, onFileClick, keyPrefix) {
  const tokens = [];
  const regex = /(\[FILE:[^\]]+\])|(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  let last = 0;
  let m;

  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) {
      tokens.push(
        <span key={`${keyPrefix}-t-${last}`}>
          {text.slice(last, m.index)}
        </span>,
      );
    }

    const key = `${keyPrefix}-m-${m.index}`;

    if (m[1]) {
      const fp = m[1].match(/\[FILE:\s*(.+?)\]/)[1].trim();
      tokens.push(
        <span
          key={key}
          className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded font-mono text-[11px] text-mint bg-mint/10 border border-mint/30 cursor-pointer hover:bg-mint/20 transition-colors duration-150"
          onClick={() => onFileClick(fp)}
        >
          {fp}
        </span>,
      );
    } else if (m[2]) {
      tokens.push(
        <code
          key={key}
          className="px-1.5 py-0.5 rounded bg-overlay text-mint font-mono text-[12px]"
        >
          {m[2].slice(1, -1)}
        </code>,
      );
    } else if (m[3]) {
      tokens.push(
        <strong key={key} className="font-semibold text-text-primary">
          {parseInline(m[3].slice(2, -2), onFileClick, `${key}-b`)}
        </strong>,
      );
    } else if (m[4]) {
      tokens.push(
        <em key={key} className="italic text-text-secondary">
          {parseInline(m[4].slice(1, -1), onFileClick, `${key}-i`)}
        </em>,
      );
    }

    last = m.index + m[0].length;
  }

  if (last < text.length) {
    tokens.push(
      <span key={`${keyPrefix}-t-${last}`}>{text.slice(last)}</span>,
    );
  }

  return tokens;
}

function renderMessageContent(text, onFileClick) {
  if (!text) return null;

  const lines = text.split("\n");
  const blocks = [];
  let currentList = null;
  let currentListType = null;

  const flushList = () => {
    if (currentList) {
      if (currentListType === "ol") {
        blocks.push(
          <ol
            key={`bl-${blocks.length}`}
            className="list-decimal list-inside space-y-1.5 my-2 ml-1"
          >
            {currentList}
          </ol>,
        );
      } else {
        blocks.push(
          <ul
            key={`bl-${blocks.length}`}
            className="list-disc list-inside space-y-1.5 my-2 ml-1"
          >
            {currentList}
          </ul>,
        );
      }
      currentList = null;
      currentListType = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    if (/^\d+\.\s/.test(trimmed)) {
      if (currentListType !== "ol") {
        flushList();
        currentList = [];
        currentListType = "ol";
      }
      const content = trimmed.replace(/^\d+\.\s*/, "");
      currentList.push(
        <li key={`li-${i}`} className="text-text-secondary">
          {parseInline(content, onFileClick, `li-${i}`)}
        </li>,
      );
      continue;
    }

    if (/^[-*]\s/.test(trimmed)) {
      if (currentListType !== "ul") {
        flushList();
        currentList = [];
        currentListType = "ul";
      }
      const content = trimmed.replace(/^[-*]\s*/, "");
      currentList.push(
        <li key={`li-${i}`} className="text-text-secondary">
          {parseInline(content, onFileClick, `li-${i}`)}
        </li>,
      );
      continue;
    }

    flushList();

    if (trimmed === "") {
      blocks.push(<div key={`sp-${i}`} className="h-2" />);
      continue;
    }

    if (/^###\s/.test(trimmed)) {
      blocks.push(
        <h4
          key={`h-${i}`}
          className="text-xs font-semibold text-text-primary mt-3 mb-1 uppercase tracking-wide"
        >
          {parseInline(trimmed.replace(/^###\s*/, ""), onFileClick, `h-${i}`)}
        </h4>,
      );
      continue;
    }

    if (/^##\s/.test(trimmed)) {
      blocks.push(
        <h3
          key={`h-${i}`}
          className="text-sm font-semibold text-text-primary mt-3 mb-1"
        >
          {parseInline(trimmed.replace(/^##\s*/, ""), onFileClick, `h-${i}`)}
        </h3>,
      );
      continue;
    }

    if (/^#\s/.test(trimmed)) {
      blocks.push(
        <h2
          key={`h-${i}`}
          className="text-base font-bold text-text-primary mt-3 mb-1"
        >
          {parseInline(trimmed.replace(/^#\s*/, ""), onFileClick, `h-${i}`)}
        </h2>,
      );
      continue;
    }

    blocks.push(
      <p key={`p-${i}`} className="leading-relaxed">
        {parseInline(line, onFileClick, `p-${i}`)}
      </p>,
    );
  }

  flushList();
  return blocks;
}

export default function ChatPanel() {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const repoId = useStore((s) => s.repoId);
  const chatMessages = useStore((s) => s.chatMessages);
  const appendMessage = useStore((s) => s.appendMessage);
  const updateLastMessage = useStore((s) => s.updateLastMessage);
  const setLastAssistantMessage = useStore((s) => s.setLastAssistantMessage);
  const setActiveNodes = useStore((s) => s.setActiveNodes);
  const setSelectedFile = useStore((s) => s.setSelectedFile);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const startSSEQuery = (q) => {
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

  const handleAsk = (event) => {
    event.preventDefault();
    if (!question.trim() || !repoId || asking) return;

    const q = question.trim();
    setQuestion("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setAsking(true);
    startSSEQuery(q);
  };

  const handleSuggestion = (suggestion) => {
    if (!repoId || asking) return;
    setAsking(true);
    startSSEQuery(suggestion);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk(e);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-surface border-l border-r border-border-subtle">
      <div className="flex items-center justify-between px-4 h-9 border-b border-border-subtle flex-shrink-0">
        <span className="text-[10px] tracking-widest text-text-muted uppercase">
          CHAT
        </span>
        <span
          className={`text-[10px] ${repoId ? "text-mint" : "text-text-muted"}`}
        >
          {repoId ? "Ready" : "Waiting for repo"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <span className="text-5xl text-mint opacity-40 mb-4">◎</span>
            <h3 className="text-sm font-medium text-text-primary mb-2">
              Ask about the codebase
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed mb-6 max-w-xs">
              Questions answered from retrieved code chunks. Files cited by the
              AI pulse on the graph.
            </p>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggestion(s)}
                  className="px-4 py-2 rounded-full border border-border-default text-xs text-text-secondary text-left hover:border-mint hover:text-mint cursor-pointer transition-all duration-150"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          chatMessages.map((message, index) => {
            if (message.role === "user") {
              return (
                <div
                  key={index}
                  className="flex justify-end animate-slide-right"
                >
                  <div className="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-br-sm text-sm leading-relaxed bg-gradient-to-br from-[var(--user-bubble-from)] to-[var(--user-bubble-to)] border border-indigo/30 text-text-primary">
                    {message.text}
                  </div>
                </div>
              );
            }

            const isError =
              message.text?.startsWith("OpenAI") ||
              message.text?.startsWith("OPENAI") ||
              message.text?.startsWith("Could not") ||
              message.text?.startsWith("Connection lost");

            return (
              <div
                key={index}
                className="flex justify-start gap-2 animate-slide-left"
              >
                <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-mint bg-mint-glow border border-border-strong mt-1">
                  AI
                </div>
                <div
                  className={`max-w-[85%] px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed ${
                    isError
                      ? "bg-red-950/40 border border-red-500/40 text-red-200"
                      : "bg-elevated border border-border-subtle text-text-primary"
                  }`}
                >
                  {message.text ? (
                    <>
                      {renderMessageContent(message.text, setSelectedFile)}
                      {asking && index === chatMessages.length - 1 && (
                        <span className="inline-block w-0.5 h-3.5 bg-mint ml-0.5 animate-blink align-middle" />
                      )}
                    </>
                  ) : (
                    <>
                      <span className="text-text-muted">
                        Searching codebase…
                      </span>
                      <span className="inline-block w-0.5 h-3.5 bg-mint ml-0.5 animate-blink align-middle" />
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex-shrink-0 p-3 border-t border-border-subtle bg-surface">
        <form onSubmit={handleAsk} className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            placeholder={
              repoId
                ? "Ask anything about this codebase..."
                : "Analyse a repo first"
            }
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={(e) => {
              e.target.style.height = "auto";
              e.target.style.height = e.target.scrollHeight + "px";
            }}
            disabled={!repoId || asking}
            rows={1}
            className="flex-1 bg-elevated border border-border-default rounded-xl px-3 py-2.5 text-sm text-text-primary font-sans outline-none resize-none focus:border-mint/50 transition-colors duration-200 placeholder:text-text-muted min-h-[40px] max-h-[120px] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!repoId || !question.trim() || asking}
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-150 bg-mint text-[#080B14] font-bold hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            →
          </button>
        </form>
      </div>
    </div>
  );
}
