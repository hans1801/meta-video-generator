import { useState, useRef, useEffect } from 'react';
import type { BatchStatus } from '../../lib/types';
import { openHandleDB } from './utils';
import SingleMode from './SingleMode';
import BatchMode from './BatchMode';
import './App.css';

type Mode = 'single' | 'project';

export default function App() {
  const [mode, setMode] = useState<Mode>('single');
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

  useEffect(() => {
    (async () => {
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
    browser.runtime.onMessage.addListener(listener as Parameters<typeof browser.runtime.onMessage.addListener>[0]);
    return () => browser.runtime.onMessage.removeListener(listener as Parameters<typeof browser.runtime.onMessage.addListener>[0]);
  }, []);

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

      {mode === 'single' && <SingleMode />}
      {mode === 'project' && <BatchMode batchStatus={batchStatus} grantedHandleRef={grantedHandleRef} />}

      <footer style={{ textAlign: 'center', fontSize: 10, color: '#35354a', paddingBottom: 8 }}>
        v{browser.runtime.getManifest().version}
      </footer>
    </div>
  );
}
