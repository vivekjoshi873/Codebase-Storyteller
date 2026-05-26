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
      tokens.push(<span key={`${keyPrefix}-t-${last}`}>{text.slice(last, m.index)}</span>);
    }

    const key = `${keyPrefix}-m-${m.index}`;

    if (m[1]) {
      const fp = m[1].match(/\[FILE:\s*(.+?)\]/)[1].trim();
      tokens.push(
        <span
          key={key}
          className="font-mono text-[11px] text-accent border-b border-accent-border cursor-pointer hover:text-ink-primary transition-colors"
          onClick={() => onFileClick(fp)}
        >
          {fp}
        </span>,
      );
    } else if (m[2]) {
      tokens.push(
        <code key={key} className="font-mono text-xs text-ink-primary">
          {m[2].slice(1, -1)}
        </code>,
      );
    } else if (m[3]) {
      tokens.push(
        <strong key={key} className="font-medium text-ink-primary">
          {parseInline(m[3].slice(2, -2), onFileClick, `${key}-b`)}
        </strong>,
      );
    } else if (m[4]) {
      tokens.push(
        <em key={key} className="italic text-ink-secondary">
          {parseInline(m[4].slice(1, -1), onFileClick, `${key}-i`)}
        </em>,
      );
    }

    last = m.index + m[0].length;
  }

  if (last < text.length) {
    tokens.push(<span key={`${keyPrefix}-t-${last}`}>{text.slice(last)}</span>);
  }

  return tokens;
}

function renderMessageContent(text, onFileClick) {
  if (!text) return null;
  return text.split("\n").map((line, i) => (
    <p key={`p-${i}`} className="leading-relaxed">
      {line ? parseInline(line, onFileClick, `p-${i}`) : <span className="h-2 block" />}
    </p>
  ));
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
        setLastAssistantMessage("Connection lost. Check that the backend is running on port 8000 and OPENAI_API_KEY is set in .env.");
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
    setQuestion(suggestion);
    setTimeout(() => {
      setAsking(true);
      startSSEQuery(suggestion);
      setQuestion("");
    }, 0);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk(e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-paper border-x border-border">
      <div className="flex items-center justify-between px-5 h-10 border-b border-border flex-shrink-0 bg-canvas">
        <span className="text-label text-ink-muted tracking-widest uppercase">CHAT</span>
        <span className={`text-label tracking-widest uppercase ${repoId ? "text-success" : "text-ink-muted"}`}>
          {repoId ? "READY" : "WAITING FOR REPO"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
        {chatMessages.length === 0 ? (
          <div className="h-full flex flex-col justify-center">
            <p className="text-label text-ink-muted tracking-widest uppercase mb-4">Ask about the codebase</p>
            <p className="text-sm text-ink-secondary leading-relaxed mb-8 max-w-xs">
              Questions are answered from retrieved code chunks. Files cited by the AI will highlight on the graph.
            </p>
            <div className="space-y-0 border-t border-border">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggestion(s)}
                  className="w-full flex items-center justify-between py-3 border-b border-border cursor-pointer group"
                >
                  <span className="text-sm text-ink-secondary group-hover:text-ink-primary transition-colors">{s}</span>
                  <span className="text-ink-muted group-hover:text-accent transition-colors text-xs">?</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          chatMessages.map((message, index) => {
            if (message.role === "user") {
              return (
                <div key={index} className="flex justify-end">
                  <div className="max-w-[75%] px-4 py-3 bg-raised border border-border text-sm text-ink-primary leading-relaxed font-light">
                    {message.text}
                  </div>
                </div>
              );
            }

            return (
              <div key={index} className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-label text-ink-muted tracking-widest uppercase">AI</span>
                  <span className="flex-1 border-t border-border" />
                </div>
                <div className="text-sm text-ink-secondary leading-relaxed font-light pt-1">
                  {message.text ? (
                    <>
                      {renderMessageContent(message.text, setSelectedFile)}
                      {asking && index === chatMessages.length - 1 && (
                        <span className="inline-block w-0.5 h-3 bg-accent ml-0.5 animate-blink align-middle" />
                      )}
                    </>
                  ) : (
                    <>
                      Searching codebase...
                      <span className="inline-block w-0.5 h-3 bg-accent ml-0.5 animate-blink align-middle" />
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex-shrink-0 border-t border-border bg-canvas">
        <form onSubmit={handleAsk} className="flex items-end">
          <textarea
            ref={textareaRef}
            placeholder={repoId ? "Ask anything about this codebase..." : "Analyse a repo first"}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={(e) => {
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            disabled={!repoId || asking}
            rows={1}
            className="flex-1 bg-transparent font-mono text-sm text-ink-primary px-5 py-4 outline-none resize-none placeholder:text-ink-muted min-h-[52px] max-h-[120px] border-r border-border"
          />
          <button
            type="submit"
            disabled={!repoId || !question.trim() || asking}
            className="px-5 py-4 text-sm font-semibold text-canvas bg-ink-primary hover:bg-accent hover:text-canvas transition-all duration-150 self-stretch flex items-center justify-center min-w-[56px] disabled:opacity-40"
          >
            ?
          </button>
        </form>
      </div>
    </div>
  );
}
