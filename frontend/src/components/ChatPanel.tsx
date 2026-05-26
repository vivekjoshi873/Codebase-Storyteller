import { useEffect, useRef, useState, type JSX } from "react";
import { useStore } from "../store";
import type { ChatMessage } from "@/types";

const SUGGESTIONS: string[] = [
  "How is this codebase structured?",
  "What handles error cases?",
  "Where does the main logic live?",
];

type ParsedPart = {
  type: "text" | "file" | "strong" | "code";
  content: string;
};

const FILE_TOKEN_REGEX = /^(?:\.\/|\.\.\/|[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+$/;

const isFileLike = (value: string): boolean => FILE_TOKEN_REGEX.test(value.trim());

const extractFileMarker = (value: string): string | null => {
  const match = value.trim().match(/^\[FILE:\s*([^\]]+)\]$/);
  return match?.[1]?.trim() ?? null;
};

const parseMessageText = (text: string): ParsedPart[] => {
  const tokens = text.split(/(\[FILE:[^\]]+\]|\*\*[^*]+\*\*|`[^`]+`)/g);

  return tokens
    .filter((token) => token.length > 0)
    .map((token) => {
      const filePath = extractFileMarker(token);
      if (filePath) {
        return { type: "file", content: filePath };
      }

      const strongMatch = token.match(/^\*\*([^*]+)\*\*$/);
      if (strongMatch?.[1]) {
        const strongText = strongMatch[1].trim();
        const nestedFilePath = extractFileMarker(strongText);
        if (nestedFilePath) {
          return { type: "file", content: nestedFilePath };
        }
        if (isFileLike(strongText)) {
          return { type: "file", content: strongText };
        }
        return { type: "strong", content: strongText };
      }

      const codeMatch = token.match(/^`([^`]+)`$/);
      if (codeMatch?.[1]) {
        const codeText = codeMatch[1].trim();
        const nestedFilePath = extractFileMarker(codeText);
        if (nestedFilePath) {
          return { type: "file", content: nestedFilePath };
        }
        if (isFileLike(codeText)) {
          return { type: "file", content: codeText };
        }
        return { type: "code", content: codeText };
      }

      return { type: "text", content: token };
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
      <div className="flex justify-end">
        <div className="max-w-[75%] px-4 py-3 bg-raised border border-border text-sm text-ink-primary leading-relaxed font-light">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="text-label text-ink-muted tracking-widest uppercase">AI</span>
        <span className="flex-1 border-t border-border" />
      </div>
      <div className="text-sm text-ink-secondary leading-relaxed font-light pt-1">
        {message.text ? (
          <>
            {message.text.split("\n").map((line: string, i: number) => (
              <p key={`${message.id}-${i}`} className="leading-relaxed">
                {parseMessageText(line).map((part: ParsedPart, idx: number) => {
                  if (part.type === "file") {
                    return (
                      <span
                        key={`${message.id}-${i}-${idx}`}
                        className="font-mono text-[11px] text-accent border-b border-accent-border cursor-pointer hover:text-ink-primary transition-colors bg-accent-dim px-0.5"
                        onClick={(): void => onFileClick(part.content)}
                      >
                        {part.content}
                      </span>
                    );
                  }

                  if (part.type === "strong") {
                    return (
                      <strong key={`${message.id}-${i}-${idx}`} className="text-ink-primary font-medium">
                        {part.content}
                      </strong>
                    );
                  }

                  if (part.type === "code") {
                    return (
                      <code key={`${message.id}-${i}-${idx}`} className="font-mono text-xs text-ink-primary bg-raised px-1 border border-border">
                        {part.content}
                      </code>
                    );
                  }

                  return <span key={`${message.id}-${i}-${idx}`}>{part.content}</span>;
                })}
              </p>
            ))}
            {isStreamingCurrent && <span className="inline-block w-0.5 h-3 bg-accent ml-0.5 animate-blink align-middle" />}
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
        <form onSubmit={handleAsk} className="flex items-end">
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
            className="flex-1 bg-transparent font-mono text-sm text-ink-primary px-5 py-4 outline-none resize-none placeholder:text-ink-muted min-h-[52px] max-h-[120px] border-r border-border"
          />
          <button
            type="submit"
            disabled={!repoId || !question.trim() || asking}
            className="px-5 py-4 text-sm font-semibold text-canvas bg-ink-primary hover:bg-accent hover:text-canvas transition-all duration-150 self-stretch flex items-center justify-center min-w-[56px] disabled:opacity-40"
          >
            -&gt;
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatPanel;
