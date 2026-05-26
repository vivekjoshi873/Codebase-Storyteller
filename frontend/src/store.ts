import { create } from "zustand";
import type { AppStore, ChatMessage, GraphData } from "@/types";

const initialGraphData: GraphData = { nodes: [], edges: [] };

const createAssistantMessage = (text: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "assistant",
  text,
  streaming: true,
});

export const useStore = create<AppStore>((set, get) => ({
  repoId: null,
  repoName: null,
  graphData: initialGraphData,
  activeNodes: [],
  selectedFile: null,
  chatMessages: [],
  fileCache: {},

  setRepoId: (id: string): void => set({ repoId: id }),
  setRepoName: (name: string): void => set({ repoName: name }),
  setGraphData: (data: GraphData): void => set({ graphData: data }),
  setActiveNodes: (nodes: string[]): void => set({ activeNodes: nodes }),
  setSelectedFile: (file: string | null): void => set({ selectedFile: file }),

  getCachedFile: (filepath: string): string | undefined => {
    const { repoId, fileCache } = get();
    if (!repoId || !filepath) return undefined;
    return fileCache[`${repoId}:${filepath}`];
  },

  cacheFile: (filepath: string, content: string): void => {
    const { repoId } = get();
    if (!repoId || !filepath) return;
    set((state) => ({
      fileCache: {
        ...state.fileCache,
        [`${repoId}:${filepath}`]: content,
      },
    }));
  },

  appendMessage: (msg: Omit<ChatMessage, "id">): void =>
    set((state) => ({
      chatMessages: [
        ...state.chatMessages,
        { ...msg, id: crypto.randomUUID() },
      ],
    })),

  updateLastMessage: (token: string): void =>
    set((state) => {
      const messages = [...state.chatMessages];
      if (messages.length === 0) {
        return { chatMessages: [createAssistantMessage(token)] };
      }
      const last = messages[messages.length - 1];
      messages[messages.length - 1] = {
        ...last,
        text: `${last.text}${token}`,
      };
      return { chatMessages: messages };
    }),

  setLastAssistantMessage: (text: string): void =>
    set((state) => {
      const messages = [...state.chatMessages];
      if (messages.length === 0) {
        return { chatMessages: [createAssistantMessage(text)] };
      }
      const last = messages[messages.length - 1];
      if (last.role !== "assistant") {
        messages.push(createAssistantMessage(text));
      } else {
        messages[messages.length - 1] = { ...last, text };
      }
      return { chatMessages: messages };
    }),

  clearLastStreaming: (): void =>
    set((state) => {
      const msgs = [...state.chatMessages];
      const last = msgs[msgs.length - 1];
      if (!last) return state;
      msgs[msgs.length - 1] = { ...last, streaming: false };
      return { chatMessages: msgs };
    }),

  reset: (): void =>
    set({
      repoId: null,
      repoName: null,
      graphData: initialGraphData,
      activeNodes: [],
      selectedFile: null,
      chatMessages: [],
      fileCache: {},
    }),
}));
