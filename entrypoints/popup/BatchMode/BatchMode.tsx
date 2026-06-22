import { useState } from 'react';
import { Actions, SceneStatuses, BatchModes } from '../../../lib/types';
import type { BatchMode, BatchStatus, SceneInput, SceneStatus } from '../../../lib/types';
import { storeProjectHandle, fileToDataUrl } from '../utils';
import {
  ProjectDirs,
  ProjectFiles,
  SCENE_VIDEO_PATTERN,
  SCENE_IMAGE_FOLDER_PATTERN,
  VIDEO_PROMPT_PREFIX,
  sceneRefImageName,
} from '../../../lib/constants';
import { Main, GenerateBtn, Spinner, AbortBtn, StatusMessage } from '../App.styled';
import {
  ProjectHeader,
  ProjectInfo,
  ProjectTitle,
  ProjectCount,
  ProgressBarWrap,
  ProgressBarTrack,
  ProgressBarFill,
  ProgressLabel,
  SceneGrid,
  SceneCell,
  FolderSelectBtn,
  ScenesCount,
  LastBatchDivider,
  LastBatchLabel,
  BatchNote,
  BatchTypeTabs,
  BatchTypeTab,
} from './BatchMode.styled';

declare function showDirectoryPicker(options?: {
  mode?: 'read' | 'readwrite';
}): Promise<FileSystemDirectoryHandle>;

// ── Types ────────────────────────────────────────────────────────────────────

interface ImagePrompt {
  subjects: { description: string; action: string }[];
  environment: string;
  lighting: string;
  composition: string;
  style: string;
}

interface SceneData {
  scene_number: number;
  image_prompt: ImagePrompt;
  video_prompt: { motion: string; camera_movement: string };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const clean = (s?: string) => s?.trim() ?? '';

function getPreCompleted(allScenes: SceneData[], pendingScenes: SceneData[]): number[] {
  const pendingNums = new Set(pendingScenes.map((s) => s.scene_number));
  return allScenes.map((s) => s.scene_number).filter((n) => !pendingNums.has(n));
}

// ── Prompt builders ──────────────────────────────────────────────────────────

function buildVideoPrompt(scene: SceneData): string {
  const { motion, camera_movement } = scene.video_prompt;
  const strip = (s?: string) => clean(s).replace(/\.$/, '');
  return `${VIDEO_PROMPT_PREFIX} ${strip(motion)} ${strip(camera_movement)}`;
}

function buildImagePrompt(scene: SceneData): string {
  const { image_prompt: ip } = scene;
  const subjects = ip.subjects.map((s) => `${clean(s.description)} ${clean(s.action)}`).join(' ');
  return [subjects, ip.environment, ip.lighting, ip.composition, ip.style].map(clean).filter(Boolean).join(' ');
}

// ── Completion checkers ──────────────────────────────────────────────────────

async function readCompletedVideoScenes(handle: FileSystemDirectoryHandle): Promise<Set<number>> {
  const completed = new Set<number>();
  try {
    const dir = await handle.getDirectoryHandle(ProjectDirs.Videos);
    for await (const [name] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      const m = name.match(SCENE_VIDEO_PATTERN);
      if (m) completed.add(parseInt(m[1]));
    }
  } catch { /* dir doesn't exist yet */ }
  return completed;
}

async function readCompletedImageScenes(handle: FileSystemDirectoryHandle): Promise<Set<number>> {
  const completed = new Set<number>();
  try {
    const dir = await handle.getDirectoryHandle(ProjectDirs.Images);
    for await (const [name, entry] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      if ((entry as FileSystemHandle & { kind: string }).kind !== 'directory') continue;
      const m = name.match(SCENE_IMAGE_FOLDER_PATTERN);
      if (m) completed.add(parseInt(m[1]));
    }
  } catch { /* dir doesn't exist yet */ }
  return completed;
}

// ── Batch launchers ──────────────────────────────────────────────────────────

async function validateSceneImagesExist(
  projectHandle: FileSystemDirectoryHandle,
  scenes: SceneData[]
): Promise<number[]> {
  const missing: number[] = [];
  try {
    const imagesDir = await projectHandle.getDirectoryHandle(ProjectDirs.Images);
    await Promise.all(
      scenes.map(async (scene) => {
        try {
          await imagesDir.getFileHandle(sceneRefImageName(scene.scene_number));
        } catch {
          missing.push(scene.scene_number);
        }
      })
    );
  } catch {
    return scenes.map((s) => s.scene_number);
  }
  return missing;
}

async function startImageBatch(
  projectName: string,
  pendingScenes: SceneData[],
  allScenes: SceneData[],
  tabId: number
) {
  const scenes: SceneInput[] = pendingScenes.map((s) => ({
    kind: BatchModes.Image,
    sceneNumber: s.scene_number,
    imagePrompt: buildImagePrompt(s),
  }));

  await browser.runtime.sendMessage({
    action: Actions.StartBatch,
    projectName,
    scenes,
    metaAiTabId: tabId,
    preCompletedSceneNumbers: getPreCompleted(allScenes, pendingScenes),
    mode: BatchModes.Image,
  });
}

async function startVideoBatch(
  projectHandle: FileSystemDirectoryHandle,
  projectName: string,
  pendingScenes: SceneData[],
  allScenes: SceneData[],
  tabId: number
) {
  const imagesDir = await projectHandle.getDirectoryHandle(ProjectDirs.Images);
  const scenes: SceneInput[] = await Promise.all(
    pendingScenes.map(async (scene) => {
      const f = await (await imagesDir.getFileHandle(sceneRefImageName(scene.scene_number))).getFile();
      return {
        kind: BatchModes.Video,
        sceneNumber: scene.scene_number,
        imageBase64: await fileToDataUrl(f),
        imageName: sceneRefImageName(scene.scene_number),
        videoPrompt: buildVideoPrompt(scene),
      };
    })
  );

  await browser.runtime.sendMessage({
    action: Actions.StartBatch,
    projectName,
    scenes,
    metaAiTabId: tabId,
    preCompletedSceneNumbers: getPreCompleted(allScenes, pendingScenes),
    mode: BatchModes.Video,
  });
}

// ── Sub-components ───────────────────────────────────────────────────────────

const SCENE_ICONS: Record<string, string> = {
  [SceneStatuses.Processing]: '⏳',
  [SceneStatuses.Done]: '✓',
  [SceneStatuses.Error]: '✗',
};

function StatusSceneGrid({
  sceneNumbers,
  sceneStatuses,
}: {
  sceneNumbers: number[];
  sceneStatuses: Record<number, SceneStatus>;
}) {
  return (
    <SceneGrid>
      {sceneNumbers.map((n) => (
        <SceneCell key={n} title={`Escena ${String(n).padStart(4, '0')}`} $status={sceneStatuses[n]}>
          {SCENE_ICONS[sceneStatuses[n]] ?? '·'}
        </SceneCell>
      ))}
    </SceneGrid>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface Props {
  batchStatus: BatchStatus | null;
  grantedHandleRef: { current: FileSystemDirectoryHandle | null };
}

export default function BatchMode({ batchStatus, grantedHandleRef }: Props) {
  const [projectHandle, setProjectHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [projectName, setProjectName] = useState('');
  const [batchScenes, setBatchScenes] = useState<SceneData[]>([]);
  const [completedScenes, setCompletedScenes] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [batchType, setBatchType] = useState<BatchMode>(BatchModes.Image);

  const isBatchActive = batchStatus?.active === true;
  const doneCount = batchStatus
    ? Object.values(batchStatus.sceneStatuses).filter((s) => s === SceneStatuses.Done).length
    : 0;
  const pendingScenes = batchScenes.filter((s) => !completedScenes.has(s.scene_number));

  const readCompleted = (handle: FileSystemDirectoryHandle, type: BatchMode) =>
    type === BatchModes.Image ? readCompletedImageScenes(handle) : readCompletedVideoScenes(handle);

  const selectFolder = async () => {
    try {
      const handle = await showDirectoryPicker({ mode: 'readwrite' });
      setProjectHandle(handle);
      setProjectName(handle.name);
      grantedHandleRef.current = handle;
      await storeProjectHandle(handle);
      setStatusMsg('');

      const scriptFile = await (await handle.getFileHandle(ProjectFiles.Script)).getFile();
      const { scenes } = JSON.parse(await scriptFile.text()) as { scenes: SceneData[] };
      setBatchScenes(scenes);
      setCompletedScenes(await readCompleted(handle, batchType));
    } catch (err: unknown) {
      if ((err as DOMException)?.name !== 'AbortError') {
        setStatusMsg('No se pudo leer la carpeta del proyecto.');
      }
    }
  };

  const switchBatchType = async (type: BatchMode) => {
    setBatchType(type);
    if (projectHandle) setCompletedScenes(await readCompleted(projectHandle, type));
  };

  const startBatch = async () => {
    if (!projectHandle || pendingScenes.length === 0) return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatusMsg('Abre meta.ai en la pestaña activa primero.');
      return;
    }

    if (batchType === BatchModes.Video) {
      const missing = await validateSceneImagesExist(projectHandle, pendingScenes);
      if (missing.length > 0) {
        setStatusMsg(`Faltan imágenes para escenas: ${missing.sort((a, b) => a - b).join(', ')}. Genera las imágenes primero.`);
        return;
      }
    }

    setLoading(true);
    setStatusMsg(batchType === BatchModes.Image ? 'Iniciando batch de imágenes...' : 'Cargando imágenes...');
    try {
      if (batchType === BatchModes.Image) {
        await startImageBatch(projectName, pendingScenes, batchScenes, tab.id);
      } else {
        await startVideoBatch(projectHandle, projectName, pendingScenes, batchScenes, tab.id);
      }
      setStatusMsg('');
    } catch (err: unknown) {
      setStatusMsg('Error: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const stopBatch = () => browser.runtime.sendMessage({ action: Actions.StopBatch }).catch(() => {});

  if (isBatchActive) {
    return (
      <Main>
        <ProjectHeader>
          <ProjectInfo>
            <ProjectTitle>{batchStatus!.projectName}</ProjectTitle>
            <ProjectCount>
              {batchStatus!.mode === BatchModes.Image ? '🖼 Imágenes · ' : '🎬 Videos · '}
              Escena {String(batchStatus!.currentIndex + 1).padStart(4, '0')} / {batchStatus!.totalScenes} · {doneCount} listas
            </ProjectCount>
          </ProjectInfo>
        </ProjectHeader>

        <ProgressBarWrap>
          <ProgressBarTrack>
            <ProgressBarFill $pct={(doneCount / batchStatus!.totalScenes) * 100} />
          </ProgressBarTrack>
          <ProgressLabel>{doneCount}/{batchStatus!.totalScenes}</ProgressLabel>
        </ProgressBarWrap>

        <StatusSceneGrid sceneNumbers={batchStatus!.sceneNumbers} sceneStatuses={batchStatus!.sceneStatuses} />

        <AbortBtn onClick={stopBatch}>■ Detener batch</AbortBtn>
        <BatchNote>El batch corre en background — puedes cerrar el popup.</BatchNote>
      </Main>
    );
  }

  return (
    <Main>
      <FolderSelectBtn onClick={selectFolder} disabled={loading}>
        {projectHandle ? `📁 ${projectName}` : '📂 Seleccionar carpeta de proyecto'}
      </FolderSelectBtn>

      {projectHandle && (
        <BatchTypeTabs>
          <BatchTypeTab $active={batchType === BatchModes.Image} onClick={() => switchBatchType(BatchModes.Image)}>
            🖼 Imágenes
          </BatchTypeTab>
          <BatchTypeTab $active={batchType === BatchModes.Video} onClick={() => switchBatchType(BatchModes.Video)}>
            🎬 Videos
          </BatchTypeTab>
        </BatchTypeTabs>
      )}

      {batchScenes.length > 0 && (
        <>
          <ScenesCount>{pendingScenes.length} pendientes · {completedScenes.size} ya generadas</ScenesCount>
          <SceneGrid>
            {batchScenes.map((s) => (
              <SceneCell
                key={s.scene_number}
                title={`Escena ${String(s.scene_number).padStart(4, '0')}`}
                $status={completedScenes.has(s.scene_number) ? SceneStatuses.Done : undefined}
              >
                {completedScenes.has(s.scene_number) ? '✓' : '·'}
              </SceneCell>
            ))}
          </SceneGrid>
          {pendingScenes.length > 0 ? (
            <GenerateBtn onClick={startBatch} disabled={loading}>
              {loading ? <Spinner /> : (
                <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                  <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
                </svg>
              )}
              {loading
                ? batchType === BatchModes.Image ? 'Iniciando...' : 'Cargando imágenes...'
                : `Continuar batch (${pendingScenes.length} pendientes)`}
            </GenerateBtn>
          ) : (
            <StatusMessage $type="success">Todas las escenas ya están generadas ✓</StatusMessage>
          )}
        </>
      )}

      {batchStatus && !batchStatus.active && batchStatus.totalScenes > 0 && (
        <LastBatchDivider>
          <LastBatchLabel>
            {batchStatus.mode === BatchModes.Image ? '🖼' : '🎬'}{' '}
            Último: {batchStatus.projectName} · {doneCount}/{batchStatus.totalScenes} completados
          </LastBatchLabel>
          <StatusSceneGrid sceneNumbers={batchStatus.sceneNumbers} sceneStatuses={batchStatus.sceneStatuses} />
        </LastBatchDivider>
      )}

      {statusMsg && <StatusMessage $type="error">{statusMsg}</StatusMessage>}
    </Main>
  );
}
