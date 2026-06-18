import { useState, useRef, useCallback } from 'react';

type Status = { type: 'idle' | 'loading' | 'success' | 'error'; message?: string };

interface ImagePreview {
  name: string;
  dataUrl: string;
}

async function getMetaTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.url?.includes('meta.ai') ? tab : null;
}

export default function SingleMode() {
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<ImagePreview | null>(null);
  const [status, setStatus] = useState<Status>({ type: 'idle' });
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
    if (!allowed.includes(file.type)) {
      setStatus({ type: 'error', message: 'Formato no soportado. Usa JPG, PNG, WebP o GIF.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      setImage({ name: file.name, dataUrl: e.target!.result as string });
      setStatus({ type: 'idle' });
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setStatus({ type: 'error', message: 'Escribe un prompt primero.' });
      return;
    }
    setStatus({ type: 'loading', message: 'Enviando a Meta AI...' });
    try {
      const tab = await getMetaTab();
      if (!tab) {
        setStatus({ type: 'error', message: 'Abre meta.ai primero y usa la extensión desde esa pestaña.' });
        return;
      }
      const resp = await browser.tabs.sendMessage(tab.id!, {
        action: 'fill_prompt',
        prompt: prompt.trim(),
        imageData: image?.dataUrl ?? null,
        fileName: image?.name ?? null,
      });
      if (!resp?.success) {
        setStatus({ type: 'error', message: resp?.error ?? 'Error desconocido.' });
        return;
      }
      setStatus({ type: 'success', message: '¡Enviado! El video se descargará automáticamente.' });
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
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

      {status.message && (
        <div className={`status status-${status.type}`}>{status.message}</div>
      )}

      <button
        className="generate-btn"
        onClick={handleGenerate}
        disabled={status.type === 'loading'}
      >
        {status.type === 'loading' ? <span className="spinner" /> : (
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
            <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {status.type === 'loading' ? 'Enviando...' : 'Generar video'}
      </button>
    </main>
  );
}
