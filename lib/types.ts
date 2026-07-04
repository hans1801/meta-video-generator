export const Actions = {
  FillPrompt: 'fill_prompt',
  StartBatch: 'start_batch',
  StopBatch: 'stop_batch',
  GetBatchStatus: 'get_batch_status',
  DownloadVideoDirect: 'download_video_direct',
  DownloadImagesDirect: 'download_images_direct',
  DownloadVideoBrowser: 'download_video_browser',
  WriteDone: 'write_done',
  WriteDoneImages: 'write_done_images',
  BatchStatus: 'batch_status',
} as const;

export const BatchModes = {
  Video: 'video',
  Image: 'image',
} as const;

export type BatchMode = (typeof BatchModes)[keyof typeof BatchModes];

export const SceneStatuses = {
  Processing: 'processing',
  Done: 'done',
  Error: 'error',
} as const;

export type SceneStatus = (typeof SceneStatuses)[keyof typeof SceneStatuses];

export type SceneInput =
  | { kind: typeof BatchModes.Video; sceneNumber: number; imageBase64: string; imageName: string; videoPrompt: string }
  | { kind: typeof BatchModes.Image; sceneNumber: number; imagePrompt: string };

export type PendingWrite =
  | { kind: typeof BatchModes.Video; sceneNumber: number; url: string }
  | { kind: typeof BatchModes.Image; sceneNumber: number; urls: string[] };

export interface BatchStatus {
  active: boolean;
  mode: BatchMode;
  projectName: string;
  currentIndex: number;
  totalScenes: number;
  sceneNumbers: number[];
  sceneStatuses: Record<number, SceneStatus>;
  pendingWrite: PendingWrite | null;
}

// ── Message contracts ─────────────────────────────────────────────────────────

export interface FillPromptMessage {
  action: typeof Actions.FillPrompt;
  prompt: string;
  imageData: string | null;
  fileName: string | null;
  sceneNumber?: number;
  mediaType?: BatchMode;
}

export interface StartBatchMessage {
  action: typeof Actions.StartBatch;
  projectName: string;
  scenes: SceneInput[];
  metaAiTabId: number;
  preCompletedSceneNumbers: number[];
  mode: BatchMode;
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
}

export interface DownloadImagesDirectMessage {
  action: typeof Actions.DownloadImagesDirect;
  urls: string[];
  sceneNumber: number;
}

export interface DownloadVideoBrowserMessage {
  action: typeof Actions.DownloadVideoBrowser;
  url: string;
}

export interface WriteDoneMessage {
  action: typeof Actions.WriteDone;
  sceneNumber: number;
}

export interface WriteDoneImagesMessage {
  action: typeof Actions.WriteDoneImages;
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
  | DownloadImagesDirectMessage
  | DownloadVideoBrowserMessage
  | WriteDoneMessage
  | WriteDoneImagesMessage
  | BatchStatusMessage;

// ── Response contracts ────────────────────────────────────────────────────────

export interface ContentResponse {
  success: boolean;
  error?: string;
  message?: string;
}
