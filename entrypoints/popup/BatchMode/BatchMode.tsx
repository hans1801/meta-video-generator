import { useState } from 'react';
import type { BatchStatus } from '../../../lib/types';
import { storeProjectHandle, fileToDataUrl } from '../utils';
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

declare function showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;

interface SceneData {
  scene_number: number;
  video_prompt: {
    motion: string;
    camera_movement: string;
  };
}

interface BatchSceneInput {
  sceneNumber: number;
  imageBase64: string;
  imageName: string;
  videoPrompt: string;
}

function buildMetaPrompt(scene: SceneData): string {
  const { video_prompt: vid } = scene;
  const clean = (s?: string) => s?.replace(/\.$/, '').trim() ?? '';
  return `Animate this image. ${clean(vid.motion)} ${clean(vid.camera_movement)}`;
}

interface Props {
  batchStatus: BatchStatus | null;
  grantedHandleRef: { current: FileSystemDirectoryHandle | null };
}

export default function BatchMode({ batchStatus, grantedHandleRef }: Props) {
  const [projectHandle, setProjectHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [projectName, setProjectName] = useState('');
  const [batchScenes, setBatchScenes] = useState<SceneData[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [setupStatus, setSetupStatus] = useState('');

  const isBatchActive = batchStatus?.active === true;
  const doneCount = batchStatus
    ? Object.values(batchStatus.sceneStatuses).filter(s => s === 'done').length
    : 0;

  const selectFolder = async () => {
    try {
      const handle = await showDirectoryPicker({ mode: 'readwrite' });
      setProjectHandle(handle);
      setProjectName(handle.name);
      grantedHandleRef.current = handle;
      await storeProjectHandle(handle);
      setSetupStatus('');
      const scriptFile = await (await handle.getFileHandle('script.json')).getFile();
      const { scenes: scenesData } = JSON.parse(await scriptFile.text()) as { scenes: SceneData[] };
      setBatchScenes(scenesData);
    } catch (err: unknown) {
      if ((err as DOMException)?.name !== 'AbortError') {
        setSetupStatus('No se pudo leer la carpeta del proyecto.');
      }
    }
  };

  const startBatch = async () => {
    if (!projectHandle || batchScenes.length === 0) return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { setSetupStatus('Abre meta.ai en la pestaña activa primero.'); return; }

    setLoadingImages(true);
    setSetupStatus('Cargando imágenes...');
    try {
      const imagesDir = await projectHandle.getDirectoryHandle('images');
      const sceneData: BatchSceneInput[] = await Promise.all(
        batchScenes.map(async scene => {
          const f = await (await imagesDir.getFileHandle(`scene_${scene.scene_number}.png`)).getFile();
          const imageBase64 = await fileToDataUrl(f);
          return {
            sceneNumber: scene.scene_number,
            imageBase64,
            imageName: `scene_${scene.scene_number}.png`,
            videoPrompt: buildMetaPrompt(scene),
          };
        })
      );
      await browser.runtime.sendMessage({
        action: 'start_batch',
        projectName,
        scenes: sceneData,
        metaAiTabId: tab.id,
      });
      setSetupStatus('');
    } catch (err: unknown) {
      setSetupStatus('Error cargando imágenes: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoadingImages(false);
    }
  };

  const stopBatch = () => browser.runtime.sendMessage({ action: 'stop_batch' }).catch(() => {});

  if (isBatchActive) {
    return (
      <Main>
        <ProjectHeader>
          <ProjectInfo>
            <ProjectTitle>{batchStatus!.projectName}</ProjectTitle>
            <ProjectCount>
              Escena {batchStatus!.currentIndex + 1} / {batchStatus!.totalScenes} · {doneCount} listas
            </ProjectCount>
          </ProjectInfo>
        </ProjectHeader>

        <ProgressBarWrap>
          <ProgressBarTrack>
            <ProgressBarFill $pct={(doneCount / batchStatus!.totalScenes) * 100} />
          </ProgressBarTrack>
          <ProgressLabel>{doneCount}/{batchStatus!.totalScenes}</ProgressLabel>
        </ProgressBarWrap>

        <SceneGrid>
          {batchStatus!.sceneNumbers.map(n => (
            <SceneCell key={n} title={`Escena ${n}`} $status={batchStatus!.sceneStatuses[n]}>
              {batchStatus!.sceneStatuses[n] === 'processing' ? '⏳'
                : batchStatus!.sceneStatuses[n] === 'done' ? '✓'
                : batchStatus!.sceneStatuses[n] === 'error' ? '✗'
                : '·'}
            </SceneCell>
          ))}
        </SceneGrid>

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
          <ScenesCount>{batchScenes.length} escenas listas</ScenesCount>
          <SceneGrid>
            {batchScenes.map(s => (
              <SceneCell key={s.scene_number} title={`Escena ${s.scene_number}`}>·</SceneCell>
            ))}
          </SceneGrid>
          <GenerateBtn onClick={startBatch} disabled={loadingImages}>
            {loadingImages ? <Spinner /> : (
              <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
              </svg>
            )}
            {loadingImages ? 'Cargando imágenes...' : `▶ Iniciar batch (${batchScenes.length} escenas)`}
          </GenerateBtn>
        </>
      )}

      {batchStatus && !batchStatus.active && batchStatus.totalScenes > 0 && (
        <LastBatchDivider>
          <LastBatchLabel>
            Último: {batchStatus.projectName} · {doneCount}/{batchStatus.totalScenes} completados
          </LastBatchLabel>
          <SceneGrid>
            {batchStatus.sceneNumbers.map(n => (
              <SceneCell key={n} title={`Escena ${n}`} $status={batchStatus.sceneStatuses[n]}>
                {batchStatus.sceneStatuses[n] === 'processing' ? '⏳'
                  : batchStatus.sceneStatuses[n] === 'done' ? '✓'
                  : batchStatus.sceneStatuses[n] === 'error' ? '✗'
                  : '·'}
              </SceneCell>
            ))}
          </SceneGrid>
        </LastBatchDivider>
      )}

      {setupStatus && <StatusMessage $type="error">{setupStatus}</StatusMessage>}
    </Main>
  );
}
