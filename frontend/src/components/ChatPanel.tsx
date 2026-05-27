import { useEffect, useRef, useState, type JSX } from "react";
import { useStore } from "../store";
import type { ChatMessage } from "@/types";

const SUGGESTIONS: string[] = [
  "How is this codebase structured?",
  "What handles error cases?",
  "Where does the main entry point live?",
  "Which files have the most dependencies?",
];

type ParsedPart = {
  type: "text" | "file";
  content: string;
};

const parseMessageText = (text: string): string[] => text.split("\n\n");

const parseParagraphParts = (paragraph: string): ParsedPart[] => {
  const parts = paragraph.split(/(\[FILE:[^\]]+\])/g);
  return parts
    .filter((part) => part.length > 0)
    .map((part): ParsedPart => {
      const match = part.match(/\[FILE:([^\]]+)\]/);
      if (match?.[1]) {
        return { type: "file", content: match[1].trim() };
      }
      return { type: "text", content: part };
    });
};

interface MessageBubbleProps {
  message: ChatMessage;
  isStreamingCurrent: boolean;
  onFileClick: (path: string) => void;
}

const Spinner = (): JSX.Element => (
  <span className="w-3 h-3 border border-ink-muted border-t-accent rounded-full animate-spin-fast flex-shrink-0" aria-hidden="true" />
);

const MessageBubble = ({ message, isStreamingCurrent, onFileClick }: MessageBubbleProps): JSX.Element => {
  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1 animate-slide-right">
        <span className="eyebrow">YOU</span>
        <div className="max-w-[78%] px-4 py-3 rounded-xl rounded-br-sm bg-overlay border border-line text-sm text-ink-primary leading-relaxed">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 animate-slide-left">
      <div className="flex items-center gap-3">
        <span className="eyebrow">AI</span>
        <div className="flex-1 h-px bg-line" />
      </div>
      <div className="text-sm text-ink-secondary leading-[1.75] pl-0">
        {message.streaming && message.text === "" ? (
          <div className="flex items-center gap-3 text-sm text-ink-muted">
            <Spinner />
            <span>Searching codebase...</span>
          </div>
        ) : (
          <>
            {parseMessageText(message.text).map((paragraph, paragraphIndex) => (
              <p key={`${message.id}-${paragraphIndex}`} className="mb-3 last:mb-0">
                {parseParagraphParts(paragraph).map((part, index) => {
                  if (part.type === "file") {
                    return (
                      <button
                        type="button"
                        key={`${message.id}-${paragraphIndex}-${index}`}
                        className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded bg-accent-subtle border border-accent-border mono-data text-[11px] text-accent cursor-pointer hover:bg-accent-border transition-colors duration-100 not-italic align-baseline"
                        onClick={(): void => onFileClick(part.content)}
                      >
                        {part.content}
                      </button>
                    );
                  }
                  return <span key={`${message.id}-${paragraphIndex}-${index}`}>{part.content}</span>;
                })}
              </p>
            ))}
            {isStreamingCurrent && <span className="inline-block w-0.5 h-3.5 bg-accent ml-0.5 animate-cursor-blink align-middle" />}
          </>
        )}
      </div>
    </div>
  );
};

const ChatPanel = (): JSX.Element => {
  const [question, setQuestion] = useState<string>("");
  const [asking, setAsking] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const repoId = useStore((s) => s.repoId);
  const chatMessages = useStore((s) => s.chatMessages);
  const appendMessage = useStore((s) => s.appendMessage);
  const updateLastMessage = useStore((s) => s.updateLastMessage);
  const setLastAssistantMessage = useStore((s) => s.setLastAssistantMessage);
  const setActiveNodes = useStore((s) => s.setActiveNodes);
  const setSelectedFile = useStore((s) => s.setSelectedFile);
  const clearLastStreaming = useStore((s) => s.clearLastStreaming);

  const status: "ready" | "waiting" | "streaming" = asking ? "streaming" : repoId ? "ready" : "waiting";

  const handleFileClick = (path: string): void => {
    setSelectedFile(path);
    setActiveNodes([path]);
  };

  useEffect((): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect((): (() => void) => {
    return (): void => {
      eventSourceRef.current?.close();
    };
  }, []);

  const finishStream = (): void => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setAsking(false);
    clearLastStreaming();
  };

  const startSSEQuery = (q: string): void => {
    if (!repoId) return;

    appendMessage({ role: "user", text: q, streaming: false });
    appendMessage({ role: "assistant", text: "", streaming: true });

    const params = new URLSearchParams({ q, repo_id: repoId });
    const source = new EventSource(`/api/query?${params.toString()}`);
    eventSourceRef.current = source;

    source.addEventListener("message", (event: MessageEvent<string>): void => {
      updateLastMessage(event.data);
    });

    source.addEventListener("highlight", (event: MessageEvent<string>): void => {
      const filepath = event.data?.trim();
      if (!filepath) return;
      setActiveNodes([filepath]);
      setSelectedFile(filepath);
    });

    source.addEventListener("error", (event: Event): void => {
      const maybeMessageEvent = event as MessageEvent<string>;
      if (maybeMessageEvent.data) setLastAssistantMessage(maybeMessageEvent.data);
      finishStream();
    });

    source.addEventListener("done", (): void => {
      finishStream();
    });

    source.onerror = (): void => {
      const messages = useStore.getState().chatMessages;
      const last = messages[messages.length - 1];
      if (last?.role === "assistant" && !last.text?.trim()) {
        setLastAssistantMessage("Connection lost. Check that the backend is running on port 8000 and OPENAI_API_KEY is set in .env.");
      }
      finishStream();
    };
  };

  const handleAsk = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!question.trim() || !repoId || asking) return;

    const q = question.trim();
    setQuestion("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setAsking(true);
    startSSEQuery(q);
  };

  const handleSuggestion = (suggestion: string): void => {
    if (!repoId || asking) return;
    setAsking(true);
    startSSEQuery(suggestion);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const form = event.currentTarget.form;
      if (form) form.requestSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="panel-header">
        <span className="eyebrow">CHAT</span>
        {status === "waiting" && <span className="eyebrow text-ink-disabled">WAITING FOR REPO</span>}
        {status === "ready" && (
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green" />
            <span className="eyebrow text-green-text">READY</span>
          </div>
        )}
        {status === "streaming" && (
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 border border-ink-muted border-t-accent rounded-full animate-spin-fast" />
            <span className="eyebrow text-accent">THINKING</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-7">
        {chatMessages.length === 0 ? (
          <div className="h-full flex flex-col justify-center">
            <p className="eyebrow mb-3">ASK THE CODEBASE</p>
            <h2 className="text-xl font-semibold text-ink-primary mb-2">What do you want to understand?</h2>
            <p className="text-sm text-ink-secondary leading-relaxed max-w-[240px] mb-8">
              Questions are answered from retrieved code chunks. Files mentioned will pulse on the graph.
            </p>
            <div className="space-y-0 border border-line rounded-xl overflow-hidden">
              {SUGGESTIONS.map((suggestion: string) => (
                <button
                  type="button"
                  key={suggestion}
                  onClick={(): void => handleSuggestion(suggestion)}
                  disabled={!repoId || asking}
                  className="w-full flex items-center justify-between px-4 py-3 border-b border-line last:border-b-0 cursor-pointer group hover:bg-raised transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="text-sm text-ink-secondary group-hover:text-ink-primary transition-colors text-left">{suggestion}</span>
                  <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-100">
                    <kbd className="text-[10px] mono-data text-ink-muted px-1.5 py-0.5 rounded bg-overlay border border-line">↵</kbd>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          chatMessages.map((message: ChatMessage, index: number) => (
            <MessageBubble
              key={message.id || `${message.role}-${index}`}
              message={message}
              isStreamingCurrent={asking && index === chatMessages.length - 1}
              onFileClick={handleFileClick}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex-shrink-0 border-t border-line bg-base">
        <form onSubmit={handleAsk} className="flex items-end gap-0">
          <textarea
            ref={textareaRef}
            placeholder={repoId ? "Ask anything about this codebase..." : "Analyse a repo first"}
            value={question}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>): void => setQuestion(event.target.value)}
            onKeyDown={handleKeyDown}
            onInput={(event: React.FormEvent<HTMLTextAreaElement>): void => {
              const target = event.currentTarget;
              target.style.height = "auto";
              target.style.height = `${target.scrollHeight}px`;
            }}
            disabled={!repoId || asking}
            rows={1}
            className="flex-1 bg-transparent mono-data text-ink-primary px-5 py-4 outline-none resize-none placeholder:text-ink-muted placeholder:font-sans placeholder:text-sm min-h-[52px] max-h-[140px] border-r border-line text-sm leading-relaxed disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!repoId || !question.trim() || asking}
            className="flex items-center justify-center w-14 h-full min-h-[52px] bg-ink-primary text-ink-inverted text-lg font-medium hover:opacity-90 active:scale-[0.98] transition-all duration-100 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {asking ? <span className="w-4 h-4 border-2 border-ink-inverted/30 border-t-ink-inverted rounded-full animate-spin-fast" /> : "→"}
          </button>
        </form>
        <div className="flex items-center justify-between px-5 py-2 border-t border-line">
          <div className="flex items-center gap-1 text-[10px] text-ink-disabled">
            <span>Press</span>
            <kbd className="mono-data px-1 py-0.5 rounded bg-raised border border-line text-ink-muted">↵</kbd>
            <span>to send ·</span>
            <kbd className="mono-data px-1 py-0.5 rounded bg-raised border border-line text-ink-muted">⇧↵</kbd>
            <span>for newline</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
