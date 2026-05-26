export interface GraphNode {
  id: string;
  label: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface D3Link {
  source: GraphNode | string;
  target: GraphNode | string;
}

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  streaming: boolean;
}

export type RepoStatus = "pending" | "processing" | "done" | "failed";

export interface IngestRequest {
  url: string;
}

export interface IngestResponse {
  repo_id: string;
  status: RepoStatus;
  graph: GraphData;
}

export interface StatusResponse {
  status: RepoStatus;
  graph?: GraphData;
  error?: string;
}

export interface AppStore {
  repoId: string | null;
  repoName: string | null;
  graphData: GraphData;
  activeNodes: string[];
  selectedFile: string | null;
  chatMessages: ChatMessage[];
  fileCache: Record<string, string>;

  setRepoId: (id: string) => void;
  setRepoName: (name: string) => void;
  setGraphData: (data: GraphData) => void;
  setActiveNodes: (nodes: string[]) => void;
  setSelectedFile: (file: string | null) => void;
  appendMessage: (msg: Omit<ChatMessage, "id">) => void;
  updateLastMessage: (token: string) => void;
  setLastAssistantMessage: (text: string) => void;
  getCachedFile: (filepath: string) => string | undefined;
  cacheFile: (filepath: string, content: string) => void;
  clearLastStreaming: () => void;
  reset: () => void;
}

export interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  label: string;
  path: string;
}

export type StepStatus = "done" | "active" | "pending";

export interface ProgressStep {
  label: string;
  status: StepStatus;
}

export type AppView = "landing" | "workspace";
