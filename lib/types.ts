export type SceneStatus = 'pending' | 'processing' | 'done' | 'error';

export interface BatchStatus {
  active: boolean;
  projectName: string;
  currentIndex: number;
  totalScenes: number;
  sceneNumbers: number[];
  sceneStatuses: Record<number, SceneStatus>;
  pendingWrite: { sceneNumber: number; url: string } | null;
}
