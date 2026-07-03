import { useState, useRef, useEffect } from 'react';
import { Actions, BatchModes } from '../../lib/types';
import type { BatchStatus, BatchStatusMessage, PendingWrite } from '../../lib/types';
import { loadProjectHandle } from './utils';
import { ProjectDirs, sceneVideoName, sceneImageSetFolder, sceneGeneratedImageName, sceneRefImageName } from '../../lib/constants';
import SingleMode from './SingleMode/SingleMode';
import BatchMode from './BatchMode/BatchMode';
import {
  GlobalStyle,
  AppContainer,
  Header,
  HeaderTop,
  HeaderLogo,
  ModeTabs,
  ModeTab,
  Footer,
} from './App.styled';

type Mode = 'single' | 'project';

async function writeBlobToFile(dir: FileSystemDirectoryHandle, name: string, blob: Blob) {
  const fh = await dir.getFileHandle(name, { create: true });
  const writable = await fh.createWritable();
  await writable.write(blob);
  await writable.close();
}

const FETCH_TIMEOUT_MS = 60000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export default function App() {
  const [mode, setMode] = useState<Mode>('single');
  const [batchStatus, setBatchStatus] = useState<BatchStatus | null>(null);
  const grantedHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  async function processVideoWrite(pw: Extract<PendingWrite, { kind: typeof BatchModes.Video }>) {
    const handle = grantedHandleRef.current;
    if (!handle) return;
    try {
      const resp = await fetchWithTimeout(pw.url);
      if (!resp.ok) return;
      const videosDir = await handle.getDirectoryHandle(ProjectDirs.Videos, { create: true });
      await writeBlobToFile(videosDir, sceneVideoName(pw.sceneNumber), await resp.blob());
      browser.runtime.sendMessage({ action: Actions.WriteDone, sceneNumber: pw.sceneNumber }).catch(() => {});
    } catch { /* write failed, batch stays on pendingWrite */ }
  }

  async function processImageWrite(pw: Extract<PendingWrite, { kind: typeof BatchModes.Image }>) {
    const handle = grantedHandleRef.current;
    if (!handle) return;
    try {
      const imagesDir = await handle.getDirectoryHandle(ProjectDirs.Images, { create: true });
      const sceneDir = await imagesDir.getDirectoryHandle(sceneImageSetFolder(pw.sceneNumber), { create: true });

      const blobs = await Promise.all(
        pw.urls.map(async (url, i) => {
          const resp = await fetchWithTimeout(url);
          if (!resp.ok) return null;
          const blob = await resp.blob();
          await writeBlobToFile(sceneDir, sceneGeneratedImageName(i), blob);
          return blob;
        })
      );

      const validBlobs = blobs.filter((b): b is Blob => b !== null);
      if (validBlobs.length > 0) {
        const refBlob = validBlobs[Math.floor(Math.random() * validBlobs.length)];
        await writeBlobToFile(imagesDir, sceneRefImageName(pw.sceneNumber), refBlob);
      }

      browser.runtime.sendMessage({ action: Actions.WriteDoneImages, sceneNumber: pw.sceneNumber }).catch(() => {});
    } catch { /* write failed, batch stays on pendingWrite */ }
  }

  function dispatchPendingWrite(pw: PendingWrite | null) {
    if (pw?.kind === BatchModes.Video) processVideoWrite(pw);
    if (pw?.kind === BatchModes.Image) processImageWrite(pw);
  }

  useEffect(() => {
    (async () => {
      try {
        const handle = await loadProjectHandle();
        if (handle) {
          const perm = await (
            handle as FileSystemDirectoryHandle & {
              requestPermission(opts: { mode: string }): Promise<string>;
            }
          ).requestPermission({ mode: 'readwrite' });
          if (perm === 'granted') grantedHandleRef.current = handle;
        }
      } catch { /* no stored handle or permission denied */ }

      try {
        const s = (await browser.runtime.sendMessage({ action: Actions.GetBatchStatus })) as BatchStatus | null;
        if (s) {
          setBatchStatus(s);
          if (s.active) setMode('project');
          dispatchPendingWrite(s.pendingWrite);
        }
      } catch { /* background not available */ }
    })();

    const listener = (msg: BatchStatusMessage) => {
      if (msg.action !== Actions.BatchStatus) return;
      setBatchStatus(msg.status);
      if (msg.status) dispatchPendingWrite(msg.status.pendingWrite);
    };
    browser.runtime.onMessage.addListener(listener as Parameters<typeof browser.runtime.onMessage.addListener>[0]);
    return () => browser.runtime.onMessage.removeListener(listener as Parameters<typeof browser.runtime.onMessage.addListener>[0]);
  }, []);

  return (
    <>
      <GlobalStyle />
      <AppContainer>
        <Header>
          <HeaderTop>
            <HeaderLogo>
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
            </HeaderLogo>
            <ModeTabs>
              <ModeTab $active={mode === 'single'} onClick={() => setMode('single')}>Escena única</ModeTab>
              <ModeTab $active={mode === 'project'} onClick={() => setMode('project')}>Proyecto</ModeTab>
            </ModeTabs>
          </HeaderTop>
        </Header>

        {mode === 'single' && <SingleMode />}
        {mode === 'project' && <BatchMode batchStatus={batchStatus} grantedHandleRef={grantedHandleRef} />}

        <Footer>v{browser.runtime.getManifest().version}</Footer>
      </AppContainer>
    </>
  );
}
