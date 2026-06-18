import { useState } from 'react';
import { Actions, SceneStatuses } from '../../../lib/types';
import type { BatchStatus, SceneInput, SceneStatus } from '../../../lib/types';
import { storeProjectHandle, fileToDataUrl } from '../utils';
import {
  ProjectDirs,
  ProjectFiles,
  sceneImageName,
  SCENE_VIDEO_PATTERN,
  VIDEO_PROMPT_PREFIX,
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
} from './BatchMode.styled';

declare function showDirectoryPicker(options?: {
  mode?: 'read' | 'readwrite';
}): Promise<FileSystemDirectoryHandle>;

function sceneIcon(s?: SceneStatus): string {
  if (s === SceneStatuses.Processing) return '⏳';
  if (s === SceneStatuses.Done) return '✓';
  if (s === SceneStatuses.Error) return '✗';
  return '·';
}

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
        <SceneCell key={n} title={`Escena ${n}`} $status={sceneStatuses[n]}>
          {sceneIcon(sceneStatuses[n])}
        </SceneCell>
      ))}
    </SceneGrid>
  );
}

interface SceneData {
  scene_number: number;
  video_prompt: {
    motion: string;
    camera_movement: string;
  };
}

function buildMetaPrompt(scene: SceneData): string {
  const { video_prompt: vid } = scene;
  const clean = (s?: string) => s?.replace(/\.$/, '').trim() ?? '';
  return `${VIDEO_PROMPT_PREFIX} ${clean(vid.motion)} ${clean(vid.camera_movement)}`;
}

async function readCompletedScenes(handle: FileSystemDirectoryHandle): Promise<Set<number>> {
  const completed = new Set<number>();
  try {
    const videosDir = await handle.getDirectoryHandle(ProjectDirs.Videos);
    for await (const [name] of videosDir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      const match = name.match(SCENE_VIDEO_PATTERN);
      if (match) completed.add(parseInt(match[1]));
    }
  } catch {
    /* videos dir doesn't exist yet */
  }
  return completed;
}

interface Props {
  batchStatus: BatchStatus | null;
  grantedHandleRef: { current: FileSystemDirectoryHandle | null };
}

export default function BatchMode({ batchStatus, grantedHandleRef }: Props) {
  const [projectHandle, setProjectHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [projectName, setProjectName] = useState('');
  const [batchScenes, setBatchScenes] = useState<SceneData[]>([]);
  const [completedScenes, setCompletedScenes] = useState<Set<number>>(new Set());
  const [loadingImages, setLoadingImages] = useState(false);
  const [setupStatus, setSetupStatus] = useState('');

  const isBatchActive = batchStatus?.active === true;
  const doneCount = batchStatus
    ? Object.values(batchStatus.sceneStatuses).filter((s) => s === SceneStatuses.Done).length
    : 0;
  const pendingScenes = batchScenes.filter((s) => !completedScenes.has(s.scene_number));

  const selectFolder = async () => {
    try {
      const handle = await showDirectoryPicker({ mode: 'readwrite' });
      setProjectHandle(handle);
      setProjectName(handle.name);
      grantedHandleRef.current = handle;
      await storeProjectHandle(handle);
      setSetupStatus('');

      const scriptFile = await (await handle.getFileHandle(ProjectFiles.Script)).getFile();
      const { scenes: scenesData } = JSON.parse(await scriptFile.text()) as {
        scenes: SceneData[];
      };
      setBatchScenes(scenesData);
      setCompletedScenes(await readCompletedScenes(handle));
    } catch (err: unknown) {
      if ((err as DOMException)?.name !== 'AbortError') {
        setSetupStatus('No se pudo leer la carpeta del proyecto.');
      }
    }
  };

  const startBatch = async () => {
    if (!projectHandle || pendingScenes.length === 0) return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setSetupStatus('Abre meta.ai en la pestaña activa primero.');
      return;
    }

    setLoadingImages(true);
    setSetupStatus('Cargando imágenes...');
    try {
      const imagesDir = await projectHandle.getDirectoryHandle(ProjectDirs.Images);
      const sceneData: SceneInput[] = await Promise.all(
        pendingScenes.map(async (scene) => {
          const f = await (
            await imagesDir.getFileHandle(sceneImageName(scene.scene_number))
          ).getFile();
          const imageBase64 = await fileToDataUrl(f);
          return {
            sceneNumber: scene.scene_number,
            imageBase64,
            imageName: sceneImageName(scene.scene_number),
            videoPrompt: buildMetaPrompt(scene),
          };
        })
      );
      const pendingNums = new Set(pendingScenes.map((s) => s.scene_number));
      const preCompletedSceneNumbers = batchScenes
        .map((s) => s.scene_number)
        .filter((n) => !pendingNums.has(n));

      await browser.runtime.sendMessage({
        action: Actions.StartBatch,
        projectName,
        scenes: sceneData,
        metaAiTabId: tab.id,
        preCompletedSceneNumbers,
      });
      setSetupStatus('');
    } catch (err: unknown) {
      setSetupStatus(
        'Error cargando imágenes: ' + (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setLoadingImages(false);
    }
  };

  const stopBatch = () =>
    browser.runtime.sendMessage({ action: Actions.StopBatch }).catch(() => {});

  if (isBatchActive) {
    return (
      <Main>
        <ProjectHeader>
          <ProjectInfo>
            <ProjectTitle>{batchStatus!.projectName}</ProjectTitle>
            <ProjectCount>
              Escena {batchStatus!.currentIndex + 1} / {batchStatus!.totalScenes} · {doneCount}{' '}
              listas
            </ProjectCount>
          </ProjectInfo>
        </ProjectHeader>

        <ProgressBarWrap>
          <ProgressBarTrack>
            <ProgressBarFill $pct={(doneCount / batchStatus!.totalScenes) * 100} />
          </ProgressBarTrack>
          <ProgressLabel>
            {doneCount}/{batchStatus!.totalScenes}
          </ProgressLabel>
        </ProgressBarWrap>

        <StatusSceneGrid
          sceneNumbers={batchStatus!.sceneNumbers}
          sceneStatuses={batchStatus!.sceneStatuses}
        />

        <AbortBtn onClick={stopBatch}>■ Detener batch</AbortBtn>
        <BatchNote>El batch corre en background — puedes cerrar el popup.</BatchNote>
      </Main>
    );
  }

  return (
    <Main>
      <FolderSelectBtn onClick={selectFolder} disabled={loadingImages}>
        {projectHandle ? `📁 ${projectName}` : '📂 Seleccionar carpeta de proyecto'}
      </FolderSelectBtn>

      {batchScenes.length > 0 && (
        <>
          <ScenesCount>
            {pendingScenes.length} pendientes · {completedScenes.size} ya generadas
          </ScenesCount>
          <SceneGrid>
            {batchScenes.map((s) => (
              <SceneCell
                key={s.scene_number}
                title={`Escena ${s.scene_number}`}
                $status={completedScenes.has(s.scene_number) ? SceneStatuses.Done : undefined}
              >
                {completedScenes.has(s.scene_number) ? '✓' : '·'}
              </SceneCell>
            ))}
          </SceneGrid>
          {pendingScenes.length > 0 ? (
            <GenerateBtn onClick={startBatch} disabled={loadingImages}>
              {loadingImages ? (
                <Spinner />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                  <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
                </svg>
              )}
              {loadingImages
                ? 'Cargando imágenes...'
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
            Último: {batchStatus.projectName} · {doneCount}/{batchStatus.totalScenes} completados
          </LastBatchLabel>
          <StatusSceneGrid
            sceneNumbers={batchStatus.sceneNumbers}
            sceneStatuses={batchStatus.sceneStatuses}
          />
        </LastBatchDivider>
      )}

      {setupStatus && <StatusMessage $type="error">{setupStatus}</StatusMessage>}
    </Main>
  );
}
