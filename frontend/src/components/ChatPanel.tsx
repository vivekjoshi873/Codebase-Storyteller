import { useEffect, useRef, useState, type FormEvent, type JSX, type KeyboardEvent, type ChangeEvent } from "react";
import { useStore } from "../store";
import type { ChatMessage, GraphNode } from "@/types";

const SUGGESTIONS: string[] = [
  "How is this codebase structured?",
  "What handles error cases?",
  "Where does the main entry point live?",
  "Which files have the most dependencies?",
];

type ParsedPart = {
  type: "text" | "file" | "bold";
  content: string;
  target?: string;
};

const FILE_TOKEN_PATTERN = /(\[FILE:[^\]]+\]|\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|(?:[\w.-]+\/)+[\w.-]+\.[A-Za-z0-9]+|[\w.-]+\.(?:py|ts|tsx|js|jsx|go|json|md|css|html|yml|yaml|toml|rs|java|c|cpp|h|hpp|sql))/g;

const parseMessageText = (text: string): string[] => text.split("\n\n");

const stripInlineMarkdown = (value: string): string => value
  .trim()
  .replace(/^\*\*(.+)\*\*$/s, "$1")
  .replace(/^`(.+)`$/s, "$1")
  .replace(/^['"](.+)['"]$/s, "$1")
  .trim();

const normalizeFileCandidate = (value: string): string => stripInlineMarkdown(value)
  .replace(/^[./\\]+/, "")
  .replace(/[),.;:!?]+$/g, "")
  .replace(/\\/g, "/");

const extractCandidateFromToken = (token: string): string => {
  const strippedToken = stripInlineMarkdown(token);
  const fileMatch = strippedToken.match(/^\[FILE:([^\]]+)\]$/);
  if (fileMatch?.[1]) return fileMatch[1];

  const markdownMatch = strippedToken.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (markdownMatch?.[2]) return markdownMatch[2];

  return strippedToken;
};

const pathFromUrl = (candidate: string): string => {
  try {
    const url = new URL(candidate);
    const parts = url.pathname.split("/").filter(Boolean);
    const blobIndex = parts.indexOf("blob");
    const treeIndex = parts.indexOf("tree");
    const pathStart = blobIndex >= 0 ? blobIndex + 2 : treeIndex >= 0 ? treeIndex + 2 : -1;
    return pathStart > 0 ? parts.slice(pathStart).join("/") : parts[parts.length - 1] ?? candidate;
  } catch {
    return candidate;
  }
};

const resolveFilePath = (candidate: string, nodes: GraphNode[]): string | null => {
  const normalized = normalizeFileCandidate(pathFromUrl(candidate));
  if (!normalized) return null;

  const exact = nodes.find((node) => node.id === normalized);
  if (exact) return exact.id;

  const byNormalizedId = nodes.find((node) => normalizeFileCandidate(node.id) === normalized);
  if (byNormalizedId) return byNormalizedId.id;

  const byLabel = nodes.find((node) => normalizeFileCandidate(node.label) === normalized);
  if (byLabel) return byLabel.id;

  const bySuffix = normalized.includes("/")
    ? nodes.find((node) => normalizeFileCandidate(node.id).endsWith(`/${normalized}`))
    : nodes.find((node) => normalizeFileCandidate(node.id).endsWith(`/${normalized}`) || normalizeFileCandidate(node.label) === normalized);

  return bySuffix?.id ?? null;
};

const parseParagraphParts = (paragraph: string, nodes: GraphNode[]): ParsedPart[] => {
  const parts = paragraph.split(FILE_TOKEN_PATTERN);
  return parts
    .filter((part) => part.length > 0)
    .map((part): ParsedPart => {
      const candidate = extractCandidateFromToken(part);
      const target = resolveFilePath(candidate, nodes);
      if (target) {
        return {
          type: "file",
          content: normalizeFileCandidate(candidate),
          target,
        };
      }
      const boldMatch = part.match(/^\*\*(.+)\*\*$/s);
      if (boldMatch?.[1]) {
        return { type: "bold", content: boldMatch[1] };
      }
      return { type: "text", content: part };
    });
};

interface MessageBubbleProps {
  message: ChatMessage;
  isStreamingCurrent: boolean;
  graphNodes: GraphNode[];
  onFileClick: (path: string) => void;
}

const Spinner = (): JSX.Element => (
  <span className="w-3 h-3 border border-[#8A8A9A] dark:border-[#5A5A68] border-t-accent rounded-full animate-spin-fast flex-shrink-0" aria-hidden="true" />
);

const MessageBubble = ({ message, isStreamingCurrent, graphNodes, onFileClick }: MessageBubbleProps): JSX.Element => {
  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1 animate-slide-right">
        <span className="eyebrow text-[#8A8A9A] dark:text-[#5A5A68]">YOU</span>
        <div className="max-w-[78%] px-4 py-3 rounded-xl rounded-br-sm bg-[#DEDAD0] dark:bg-[#1F1F28] border border-black/[0.10] dark:border-white/[0.08] text-sm text-[#0F0F12] dark:text-[#F2F2F4] leading-relaxed transition-colors duration-200 ease-out">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 animate-slide-left">
      <div className="flex items-center gap-3">
        <span className="eyebrow text-[#8A8A9A] dark:text-[#5A5A68]">AI</span>
        <div className="flex-1 h-px bg-black/[0.08] dark:bg-white/[0.06] transition-colors duration-200 ease-out" />
      </div>
      <div className="text-sm text-[#4A4A58] dark:text-[#9B9BA8] leading-[1.75] pl-0 transition-colors duration-200 ease-out">
        {message.streaming && message.text === "" ? (
          <div className="flex items-center gap-3 text-sm text-[#8A8A9A] dark:text-[#5A5A68]">
            <Spinner />
            <span>Searching codebase...</span>
          </div>
        ) : (
          <>
            {parseMessageText(message.text).map((paragraph, paragraphIndex) => (
              <p key={`${message.id}-${paragraphIndex}`} className="mb-3 last:mb-0">
                {parseParagraphParts(paragraph, graphNodes).map((part, index) => {
                  if (part.type === "file") {
                    return (
                      <button
                        type="button"
                        key={`${message.id}-${paragraphIndex}-${index}`}
                        className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/25 mono-data text-[11px] text-amber-500 cursor-pointer hover:bg-amber-500/20 transition-colors duration-200 ease-out not-italic align-baseline"
                        onClick={(): void => onFileClick(part.target ?? part.content)}
                        title={`Open ${part.target ?? part.content}`}
                      >
                        {part.content}
                      </button>
                    );
                  }
                  if (part.type === "bold") {
                    return <strong key={`${message.id}-${paragraphIndex}-${index}`} className="font-semibold text-[#0F0F12] dark:text-[#F2F2F4]">{part.content}</strong>;
                  }
                  return <span key={`${message.id}-${paragraphIndex}-${index}`}>{part.content}</span>;
                })}
              </p>
            ))}
            {isStreamingCurrent && <span className="inline-block w-0.5 h-3.5 bg-amber-500 ml-0.5 animate-cursor-blink align-middle" />}
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
  const graphData = useStore((s) => s.graphData);
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

  const handleCancel = (): void => {
    if (!asking) return;
    const messages = useStore.getState().chatMessages;
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && !last.text?.trim()) {
      setLastAssistantMessage("Query cancelled by user.");
    }
    finishStream();
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

  const handleAsk = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
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

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const form = event.currentTarget.form;
      if (form) form.requestSubmit();
    }
  };

  return (
    <div className="theme-aware flex flex-col h-full bg-[#ECEAE2] dark:bg-[#111118] border-x border-black/[0.08] dark:border-white/[0.06]">
      <div className="theme-aware flex items-center justify-between h-10 px-5 bg-[#F2EFE8] dark:bg-[#0A0A0F] border-b border-black/[0.06] dark:border-white/[0.06] flex-shrink-0">
        <span className="eyebrow text-[#8A8A9A] dark:text-[#5A5A68]">CHAT</span>
        {status === "waiting" && <span className="eyebrow text-[#C0C0CC] dark:text-[#36363F]">WAITING FOR REPO</span>}
        {status === "ready" && (
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green" />
            <span className="eyebrow text-green-text">READY</span>
          </div>
        )}
        {status === "streaming" && (
          <div className="flex items-center gap-2">
            <Spinner />
            <span className="eyebrow text-accent">THINKING</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-7">
        {chatMessages.length === 0 ? (
          <div className="h-full flex flex-col justify-center">
            <p className="eyebrow text-[#8A8A9A] dark:text-[#5A5A68] mb-3">ASK THE CODEBASE</p>
            <h2 className="text-xl font-semibold text-[#0F0F12] dark:text-[#F2F2F4] mb-2 transition-colors duration-200 ease-out">What do you want to understand?</h2>
            <p className="text-sm text-[#4A4A58] dark:text-[#9B9BA8] leading-relaxed max-w-[240px] mb-8 transition-colors duration-200 ease-out">
              Questions are answered from retrieved code chunks. Files mentioned will pulse on the graph.
            </p>
            <div className="theme-aware space-y-0 border border-black/[0.08] dark:border-white/[0.08] rounded-xl overflow-hidden">
              {SUGGESTIONS.map((suggestion: string) => (
                <button
                  type="button"
                  key={suggestion}
                  onClick={(): void => handleSuggestion(suggestion)}
                  disabled={!repoId || asking}
                  className="w-full flex items-center justify-between px-4 py-3 border-b border-black/[0.08] dark:border-white/[0.08] last:border-b-0 cursor-pointer group hover:bg-[#DEDAD0] dark:hover:bg-[#18181F] transition-colors duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="text-sm text-[#4A4A58] dark:text-[#9B9BA8] group-hover:text-[#0F0F12] dark:group-hover:text-[#F2F2F4] transition-colors duration-200 ease-out text-left">{suggestion}</span>
                  <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <kbd className="text-[10px] mono-data text-[#8A8A9A] dark:text-[#5A5A68] px-1.5 py-0.5 rounded bg-[#DEDAD0] dark:bg-[#1F1F28] border border-black/[0.08] dark:border-white/[0.08]">Enter</kbd>
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
              graphNodes={graphData.nodes}
              onFileClick={handleFileClick}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="theme-aware flex-shrink-0 bg-[#F2EFE8] dark:bg-[#0A0A0F] border-t border-black/[0.06] dark:border-white/[0.06]">
        <form onSubmit={handleAsk} className="flex items-end gap-0">
          <textarea
            ref={textareaRef}
            placeholder={repoId ? "Ask anything about this codebase..." : "Analyse a repo first"}
            value={question}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>): void => setQuestion(event.target.value)}
            onKeyDown={handleKeyDown}
            onInput={(event: FormEvent<HTMLTextAreaElement>): void => {
              const target = event.currentTarget;
              target.style.height = "auto";
              target.style.height = `${target.scrollHeight}px`;
            }}
            disabled={!repoId || asking}
            rows={1}
            className="flex-1 bg-transparent mono-data text-[#0F0F12] dark:text-[#F2F2F4] px-5 py-4 outline-none resize-none placeholder:text-[#8A8A9A] dark:placeholder:text-[#5A5A68] placeholder:font-sans placeholder:text-sm min-h-[52px] max-h-[140px] border-r border-black/[0.08] dark:border-white/[0.08] text-sm leading-relaxed disabled:cursor-not-allowed transition-colors duration-200 ease-out"
          />
          {asking ? (
            <button
              type="button"
              onClick={handleCancel}
              className="flex items-center justify-center w-14 h-full min-h-[52px] bg-red hover:bg-red/90 text-white dark:bg-red dark:hover:bg-red/90 text-lg font-medium hover:opacity-95 active:scale-[0.95] transition-all duration-150 ease-out animate-scale-in flex-shrink-0 cursor-pointer"
              title="Cancel processing"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z" clipRule="evenodd" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!repoId || !question.trim()}
              className="flex items-center justify-center w-14 h-full min-h-[52px] bg-[#0F0F12] dark:bg-[#F2F2F4] text-[#F8F6F1] dark:text-[#0A0A0F] text-lg font-medium hover:opacity-90 active:scale-[0.98] transition-all duration-200 ease-out disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0 cursor-pointer"
            >
              -&gt;
            </button>
          )}
        </form>
        <div className="theme-aware flex items-center justify-between px-5 py-2 border-t border-black/[0.06] dark:border-white/[0.06]">
         
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
