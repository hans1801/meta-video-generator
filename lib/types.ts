export const Actions = {
  FillPrompt: 'fill_prompt',
  StartBatch: 'start_batch',
  StopBatch: 'stop_batch',
  GetBatchStatus: 'get_batch_status',
  DownloadVideoDirect: 'download_video_direct',
  WriteDone: 'write_done',
  BatchStatus: 'batch_status',
} as const;

export const SceneStatuses = {
  Pending: 'pending',
  Processing: 'processing',
  Done: 'done',
  Error: 'error',
} as const;

export type SceneStatus = (typeof SceneStatuses)[keyof typeof SceneStatuses];

export interface SceneInput {
  sceneNumber: number;
  imageBase64: string;
  imageName: string;
  videoPrompt: string;
}

export interface BatchStatus {
  active: boolean;
  projectName: string;
  currentIndex: number;
  totalScenes: number;
  sceneNumbers: number[];
  sceneStatuses: Record<number, SceneStatus>;
  pendingWrite: { sceneNumber: number; url: string } | null;
}

// ── Message contracts ─────────────────────────────────────────────────────────

export interface FillPromptMessage {
  action: typeof Actions.FillPrompt;
  prompt: string;
  imageData: string | null;
  fileName: string | null;
  sceneNumber?: number;
  projectName?: string;
}

export interface StartBatchMessage {
  action: typeof Actions.StartBatch;
  projectName: string;
  scenes: SceneInput[];
  metaAiTabId: number;
  preCompletedSceneNumbers: number[];
}

export interface StopBatchMessage {
  action: typeof Actions.StopBatch;
}

export interface GetBatchStatusMessage {
  action: typeof Actions.GetBatchStatus;
}

export interface DownloadVideoDirectMessage {
  action: typeof Actions.DownloadVideoDirect;
  url: string;
  sceneNumber: number;
  projectName: string;
}

export interface WriteDoneMessage {
  action: typeof Actions.WriteDone;
  sceneNumber: number;
}

export interface BatchStatusMessage {
  action: typeof Actions.BatchStatus;
  status: BatchStatus | null;
}

export type ExtensionMessage =
  | FillPromptMessage
  | StartBatchMessage
  | StopBatchMessage
  | GetBatchStatusMessage
  | DownloadVideoDirectMessage
  | WriteDoneMessage
  | BatchStatusMessage;

// ── Response contracts ────────────────────────────────────────────────────────

export interface ContentResponse {
  success: boolean;
  error?: string;
  message?: string;
}
