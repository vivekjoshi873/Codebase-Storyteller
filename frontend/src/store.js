import { create } from "zustand";

export const useStore = create((set, get) => ({
  repoId: null,
  graphData: { nodes: [], edges: [] },
  activeNodes: [],
  selectedFile: null,
  chatMessages: [],
  fileCache: {},

  setRepoId: (repoId) => set({ repoId }),
  setGraphData: (graphData) => set({ graphData }),
  setActiveNodes: (activeNodes) => set({ activeNodes }),
  setSelectedFile: (selectedFile) => set({ selectedFile }),

  getCachedFile: (filepath) => {
    const { repoId, fileCache } = get();
    if (!repoId || !filepath) return undefined;
    return fileCache[`${repoId}:${filepath}`];
  },

  cacheFile: (filepath, content) => {
    const { repoId } = get();
    if (!repoId || !filepath) return;
    set((state) => ({
      fileCache: {
        ...state.fileCache,
        [`${repoId}:${filepath}`]: content,
      },
    }));
  },

  appendMessage: (msg) =>
    set((state) => ({
      chatMessages: [...state.chatMessages, msg],
    })),

  updateLastMessage: (token) =>
    set((state) => {
      const messages = [...state.chatMessages];
      if (messages.length === 0) {
        return {
          chatMessages: [{ role: "assistant", text: token }],
        };
      }
      const last = messages[messages.length - 1];
      messages[messages.length - 1] = {
        ...last,
        text: (last.text || "") + token,
      };
      return { chatMessages: messages };
    }),

  setLastAssistantMessage: (text) =>
    set((state) => {
      const messages = [...state.chatMessages];
      if (messages.length === 0) {
        return { chatMessages: [{ role: "assistant", text }] };
      }
      const last = messages[messages.length - 1];
      if (last.role !== "assistant") {
        messages.push({ role: "assistant", text });
      } else {
        messages[messages.length - 1] = { ...last, text };
      }
      return { chatMessages: messages };
    }),
}));
