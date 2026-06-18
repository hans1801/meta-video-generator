import { useState } from 'react';
import type { BatchStatus, SceneStatus } from '../../lib/types';
import { storeProjectHandle, fileToDataUrl } from './utils';

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

function sceneIcon(s?: SceneStatus) {
  if (s === 'processing') return '⏳';
  if (s === 'done') return '✓';
  if (s === 'error') return '✗';
  return '·';
}

function sceneStyle(s?: SceneStatus): React.CSSProperties {
  return {
    width: 22, height: 22, fontSize: 11, fontWeight: 'bold',
    display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4,
    background: s === 'done' ? '#1a4028' : s === 'error' ? '#3a1020' : s === 'processing' ? '#2a2a10' : '#1e1e2e',
    color: s === 'done' ? '#60d080' : s === 'error' ? '#f08090' : s === 'processing' ? '#e0c060' : '#55556a',
    border: '1px solid transparent',
    borderColor: s === 'done' ? '#1a5035' : s === 'error' ? '#4a1a30' : s === 'processing' ? '#3a3a10' : '#2a2a3a',
  };
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
      <main className="main">
        <div className="project-header">
          <div className="project-info">
            <span className="project-title">{batchStatus!.projectName}</span>
            <span className="project-count">
              Escena {batchStatus!.currentIndex + 1} / {batchStatus!.totalScenes} · {doneCount} listas
            </span>
          </div>
        </div>

        <div className="progress-bar-wrap">
          <div className="progress-bar-track">
            <div
              className="progress-bar-fill"
              style={{ width: `${(doneCount / batchStatus!.totalScenes) * 100}%` }}
            />
          </div>
          <span className="progress-label">{doneCount}/{batchStatus!.totalScenes}</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {batchStatus!.sceneNumbers.map(n => (
            <div key={n} title={`Escena ${n}`} style={sceneStyle(batchStatus!.sceneStatuses[n])}>
              {sceneIcon(batchStatus!.sceneStatuses[n])}
            </div>
          ))}
        </div>

        <button className="abort-btn" onClick={stopBatch}>■ Detener batch</button>
        <p style={{ fontSize: 11, color: '#55556a', lineHeight: 1.4 }}>
          El batch corre en background — puedes cerrar el popup.
        </p>
      </main>
    );
  }

  return (
    <main className="main">
      <button
        onClick={selectFolder}
        disabled={loadingImages}
        style={{
          padding: '10px 12px', borderRadius: 8, border: '1px solid #2a2a3a',
          cursor: 'pointer', background: '#17171f', textAlign: 'left', fontSize: 13,
          color: '#c8c8e0', width: '100%',
        }}
      >
        {projectHandle ? `📁 ${projectName}` : '📂 Seleccionar carpeta de proyecto'}
      </button>

      {batchScenes.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: '#8888a8' }}>
            {batchScenes.length} escenas listas
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {batchScenes.map(s => (
              <div key={s.scene_number} title={`Escena ${s.scene_number}`} style={sceneStyle()}>·</div>
            ))}
          </div>
          <button className="generate-btn" onClick={startBatch} disabled={loadingImages}>
            {loadingImages ? <span className="spinner" /> : (
              <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
              </svg>
            )}
            {loadingImages ? 'Cargando imágenes...' : `▶ Iniciar batch (${batchScenes.length} escenas)`}
          </button>
        </>
      )}

      {batchStatus && !batchStatus.active && batchStatus.totalScenes > 0 && (
        <div style={{ borderTop: '1px solid #1e1e2e', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: '#55556a' }}>
            Último: {batchStatus.projectName} · {doneCount}/{batchStatus.totalScenes} completados
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {batchStatus.sceneNumbers.map(n => (
              <div key={n} title={`Escena ${n}`} style={sceneStyle(batchStatus.sceneStatuses[n])}>
                {sceneIcon(batchStatus.sceneStatuses[n])}
              </div>
            ))}
          </div>
        </div>
      )}

      {setupStatus && <div className="status status-error">{setupStatus}</div>}
    </main>
  );
}
