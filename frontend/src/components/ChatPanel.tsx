import { useEffect, useRef, useState, type JSX } from "react";
import { useStore } from "../store";
import type { ChatMessage } from "@/types";

const SUGGESTIONS: string[] = [
  "How is this codebase structured?",
  "What handles error cases?",
  "Where does the main logic live?",
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
    .map((part) => {
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

const MessageBubble = ({ message, isStreamingCurrent, onFileClick }: MessageBubbleProps): JSX.Element => {
  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="text-[10px] text-ink-muted tracking-widest uppercase">You</span>
        <div className="max-w-[75%] px-4 py-3 bg-raised border border-border text-sm text-ink-primary leading-relaxed">{message.text}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="text-[10px] text-ink-muted tracking-widest uppercase">AI</span>
        <div className="flex-1 border-t border-border" />
      </div>
      <div className="text-[13.5px] leading-7 text-[#94A3B8]">
        {message.streaming && message.text === "" ? (
          <div className="flex items-center gap-2 text-[13px] text-ink-muted">
            <span className="w-3 h-3 border border-ink-muted border-t-ink-primary rounded-full animate-spin-slow flex-shrink-0" />
            <span>Searching codebase...</span>
          </div>
        ) : (
          <>
            {parseMessageText(message.text).map((paragraph, paragraphIndex) => (
              <p key={`${message.id}-${paragraphIndex}`} className="mb-3 last:mb-0">
                {parseParagraphParts(paragraph).map((part, i) => {
                  if (part.type === "file") {
                    return (
                      <span
                        key={`${message.id}-${paragraphIndex}-${i}`}
                        className="inline-flex items-center px-2 py-0.5 mx-0.5 font-mono text-[11px] rounded bg-accent/10 border border-accent/30 text-accent cursor-pointer hover:bg-accent/20 transition-colors not-italic"
                        onClick={(): void => onFileClick(part.content)}
                      >
                        {part.content}
                      </span>
                    );
                  }
                  return <span key={`${message.id}-${paragraphIndex}-${i}`}>{part.content}</span>;
                })}
              </p>
            ))}
            {isStreamingCurrent && <span className="inline-block w-0.5 h-3 bg-accent ml-0.5 animate-blink align-middle" />}
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

  const status: "ready" | "waiting" = repoId ? "ready" : "waiting";

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const form = e.currentTarget.form;
      if (form) form.requestSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full bg-paper border-x border-border">
      <div className="flex items-center justify-between px-5 h-10 border-b border-border flex-shrink-0 bg-canvas">
        <span className="text-label text-ink-muted tracking-widest uppercase">CHAT</span>
        <div className="flex items-center gap-2">
          {status === "ready" && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
          <span className={`text-label tracking-widest uppercase ${status === "ready" ? "text-green-400" : "text-ink-muted"}`}>
            {status === "ready" ? "READY" : "WAITING FOR REPO"}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-8">
        {chatMessages.length === 0 ? (
          <div className="h-full flex flex-col justify-center">
            <p className="text-label text-ink-muted tracking-widest uppercase mb-4">Ask about the codebase</p>
            <p className="text-sm text-ink-secondary leading-relaxed mb-8 max-w-xs">
              Questions are answered from retrieved code chunks. Files cited by the AI will highlight on the graph.
            </p>
            <div className="space-y-0 border-t border-border">
              {SUGGESTIONS.map((s: string) => (
                <button
                  key={s}
                  onClick={(): void => handleSuggestion(s)}
                  className="w-full flex items-center justify-between py-3 border-b border-border cursor-pointer group"
                >
                  <span className="text-sm text-ink-secondary group-hover:text-ink-primary transition-colors">{s}</span>
                  <span className="text-ink-muted group-hover:text-accent transition-colors text-xs">-&gt;</span>
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

      <div className="flex-shrink-0 border-t border-border bg-canvas">
        <form onSubmit={handleAsk} className="flex items-end px-5 py-3 gap-3">
          <textarea
            ref={textareaRef}
            placeholder={repoId ? "Ask anything about this codebase..." : "Analyse a repo first"}
            value={question}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>): void => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={(e: React.FormEvent<HTMLTextAreaElement>): void => {
              const target = e.currentTarget;
              target.style.height = "auto";
              target.style.height = `${target.scrollHeight}px`;
            }}
            disabled={!repoId || asking}
            rows={1}
            className="flex-1 bg-transparent font-mono text-sm text-ink-primary px-0 py-2 outline-none resize-none placeholder:text-ink-muted min-h-[52px] max-h-[120px]"
          />
          <button
            type="submit"
            disabled={!repoId || !question.trim() || asking}
            className="w-10 h-10 flex items-center justify-center flex-shrink-0 bg-[#E8FF8B] text-[#0A0A0A] font-bold text-base transition-all duration-150 hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <span className="text-lg">-&gt;</span>
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatPanel;
