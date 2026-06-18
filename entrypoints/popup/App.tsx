import { useState, useRef, useCallback, useEffect } from 'react';
import './App.css';

declare function showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;

function openHandleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('meta-video-gen', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeProjectHandle(handle: FileSystemDirectoryHandle) {
  const db = await openHandleDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, 'projectDir');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

type Mode = 'single' | 'project';
type Status = { type: 'idle' | 'loading' | 'success' | 'error'; message?: string };

interface ImagePreview {
  name: string;
  dataUrl: string;
}

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

interface BatchStatus {
  active: boolean;
  projectName: string;
  currentIndex: number;
  totalScenes: number;
  sceneNumbers: number[];
  sceneStatuses: Record<number, 'pending' | 'processing' | 'done' | 'error'>;
  pendingWrite: { sceneNumber: number; url: string } | null;
}

function buildMetaPrompt(scene: SceneData): string {
  const { video_prompt: vid } = scene;
  const clean = (s?: string) => s?.replace(/\.$/, '').trim() ?? '';
  return `Animate this image. ${clean(vid.motion)} ${clean(vid.camera_movement)}`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target!.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const [mode, setMode] = useState<Mode>('single');

  // ── Single mode state ─────────────────────────────────────────────
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<ImagePreview | null>(null);
  const [singleStatus, setSingleStatus] = useState<Status>({ type: 'idle' });
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Batch mode state ──────────────────────────────────────────────
  const [projectHandle, setProjectHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [projectName, setProjectName] = useState('');
  const [batchScenes, setBatchScenes] = useState<SceneData[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [setupStatus, setSetupStatus] = useState('');
  const [batchStatus, setBatchStatus] = useState<BatchStatus | null>(null);
  const grantedHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  async function processWrite(pw: { sceneNumber: number; url: string }) {
    const handle = grantedHandleRef.current;
    if (!handle) return;
    try {
      const resp = await fetch(pw.url);
      if (!resp.ok) return;
      const blob = await resp.blob();
      const videosDir = await handle.getDirectoryHandle('videos', { create: true });
      const fh = await videosDir.getFileHandle(`scene_${pw.sceneNumber}.mp4`, { create: true });
      const writable = await fh.createWritable();
      await writable.write(blob);
      await writable.close();
      browser.runtime.sendMessage({ action: 'write_done', sceneNumber: pw.sceneNumber }).catch(() => {});
    } catch { /* write failed, batch stays on pendingWrite */ }
  }

  // Fetch batch status on mount and listen for live updates from background
  useEffect(() => {
    (async () => {
      // Re-grant permission for stored handle (popup open = user gesture context)
      try {
        const db = await openHandleDB();
        const handle = await new Promise<FileSystemDirectoryHandle | null>(res => {
          const tx = db.transaction('handles', 'readonly');
          const req = tx.objectStore('handles').get('projectDir');
          req.onsuccess = () => { db.close(); res(req.result ?? null); };
          req.onerror = () => { db.close(); res(null); };
        });
        if (handle) {
          const perm = await (handle as FileSystemDirectoryHandle & {
            requestPermission(opts: { mode: string }): Promise<string>;
          }).requestPermission({ mode: 'readwrite' });
          if (perm === 'granted') grantedHandleRef.current = handle;
        }
      } catch { /* no stored handle or permission denied */ }

      // Now get batch status and process any pending write
      try {
        const s = await browser.runtime.sendMessage({ action: 'get_batch_status' }) as BatchStatus | null;
        if (s) {
          setBatchStatus(s);
          if (s.active) setMode('project');
          if (s.pendingWrite) processWrite(s.pendingWrite);
        }
      } catch { /* background not available */ }
    })();

    const listener = (msg: { action: string; status: BatchStatus }) => {
      if (msg.action !== 'batch_status') return;
      setBatchStatus(msg.status);
      const pw = msg.status?.pendingWrite;
      if (pw) processWrite(pw);
    };
    browser.runtime.onMessage.addListener(
      listener as Parameters<typeof browser.runtime.onMessage.addListener>[0]
    );
    return () => browser.runtime.onMessage.removeListener(
      listener as Parameters<typeof browser.runtime.onMessage.addListener>[0]
    );
  }, []);

  async function getMetaTab() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab?.url?.includes('meta.ai') ? tab : null;
  }

  // ── Single mode handlers ──────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
    if (!allowed.includes(file.type)) {
      setSingleStatus({ type: 'error', message: 'Formato no soportado. Usa JPG, PNG, WebP o GIF.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      setImage({ name: file.name, dataUrl: e.target!.result as string });
      setSingleStatus({ type: 'idle' });
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleSingleGenerate = async () => {
    if (!prompt.trim()) {
      setSingleStatus({ type: 'error', message: 'Escribe un prompt primero.' });
      return;
    }
    setSingleStatus({ type: 'loading', message: 'Enviando a Meta AI...' });
    try {
      const tab = await getMetaTab();
      if (!tab) {
        setSingleStatus({ type: 'error', message: 'Abre meta.ai primero y usa la extensión desde esa pestaña.' });
        return;
      }

      const resp = await browser.tabs.sendMessage(tab.id!, {
        action: 'fill_prompt',
        prompt: prompt.trim(),
        imageData: image?.dataUrl ?? null,
        fileName: image?.name ?? null,
      });

      if (!resp?.success) {
        setSingleStatus({ type: 'error', message: resp?.error ?? 'Error desconocido.' });
        return;
      }

      setSingleStatus({ type: 'success', message: '¡Enviado! El video se descargará automáticamente.' });
    } catch (err) {
      setSingleStatus({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  // ── Batch mode handlers ───────────────────────────────────────────

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

  // ── Derived values ────────────────────────────────────────────────

  const doneCount = batchStatus
    ? Object.values(batchStatus.sceneStatuses).filter(s => s === 'done').length
    : 0;
  const isBatchActive = batchStatus?.active === true;

  const sceneIcon = (s?: string) =>
    s === 'processing' ? '⏳' : s === 'done' ? '✓' : s === 'error' ? '✗' : '·';

  const sceneStyle = (s?: string): React.CSSProperties => ({
    width: 22, height: 22, fontSize: 11, fontWeight: 'bold',
    display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4,
    background: s === 'done' ? '#1a4028' : s === 'error' ? '#3a1020' : s === 'processing' ? '#2a2a10' : '#1e1e2e',
    color: s === 'done' ? '#60d080' : s === 'error' ? '#f08090' : s === 'processing' ? '#e0c060' : '#55556a',
    border: '1px solid transparent',
    borderColor: s === 'done' ? '#1a5035' : s === 'error' ? '#4a1a30' : s === 'processing' ? '#3a3a10' : '#2a2a3a',
  });

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <div className="header-logo">
            <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
              <circle cx="12" cy="12" r="10" fill="url(#hgrad)" />
              <path d="M8 12l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="hgrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#3b82f6" />
                </linearGradient>
              </defs>
            </svg>
            <span>Meta AI Video</span>
          </div>
          <div className="mode-tabs">
            <button className={`mode-tab ${mode === 'single' ? 'active' : ''}`} onClick={() => setMode('single')}>
              Escena única
            </button>
            <button className={`mode-tab ${mode === 'project' ? 'active' : ''}`} onClick={() => setMode('project')}>
              Proyecto
            </button>
          </div>
        </div>
      </header>

      {/* ── Single mode ── */}
      {mode === 'single' && (
        <main className="main">
          <div className="field">
            <label className="label">Prompt del video</label>
            <textarea
              className="textarea"
              placeholder="Describe el video que quieres generar..."
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={5}
            />
          </div>

          <div className="field">
            <label className="label">
              Imagen de referencia <span className="optional">(opcional)</span>
            </label>
            <div
              className={`dropzone ${isDragging ? 'dragging' : ''} ${image ? 'has-image' : ''}`}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              {image ? (
                <div className="image-preview">
                  <img src={image.dataUrl} alt="preview" />
                  <button className="remove-btn" onClick={e => { e.stopPropagation(); setImage(null); }}>×</button>
                  <span className="image-name">{image.name}</span>
                </div>
              ) : (
                <div className="dropzone-hint">
                  <svg viewBox="0 0 24 24" fill="none" width="28" height="28">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Arrastra una imagen o haz clic</span>
                  <small>JPG, PNG, WebP, GIF</small>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
              className="hidden-input"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />
          </div>

          {singleStatus.message && (
            <div className={`status status-${singleStatus.type}`}>{singleStatus.message}</div>
          )}

          <button
            className="generate-btn"
            onClick={handleSingleGenerate}
            disabled={singleStatus.type === 'loading'}
          >
            {singleStatus.type === 'loading' ? <span className="spinner" /> : (
              <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {singleStatus.type === 'loading' ? 'Enviando...' : 'Generar video'}
          </button>
        </main>
      )}

      {/* ── Batch mode ── */}
      {mode === 'project' && (
        <main className="main">
          {isBatchActive ? (
            /* Running batch — live progress */
            <>
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
            </>
          ) : (
            /* Setup UI */
            <>
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
                  <button
                    className="generate-btn"
                    onClick={startBatch}
                    disabled={loadingImages}
                  >
                    {loadingImages ? <span className="spinner" /> : (
                      <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                        <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
                      </svg>
                    )}
                    {loadingImages ? 'Cargando imágenes...' : `▶ Iniciar batch (${batchScenes.length} escenas)`}
                  </button>
                </>
              )}

              {/* Last batch summary */}
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

              {setupStatus && (
                <div className="status status-error">{setupStatus}</div>
              )}
            </>
          )}
        </main>
      )}
      <footer style={{ textAlign: 'center', fontSize: 10, color: '#35354a', paddingBottom: 8 }}>
        v{browser.runtime.getManifest().version}
      </footer>
    </div>
  );
}
