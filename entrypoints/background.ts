import { Actions, SceneStatuses, BatchModes } from '../lib/types';
import { Alarms } from '../lib/constants';
import type { BatchMode, PendingWrite, SceneStatus, BatchStatus, SceneInput, ExtensionMessage } from '../lib/types';

export type { BatchStatus };

interface BatchState {
  active: boolean;
  mode: BatchMode;
  projectName: string;
  scenes: SceneInput[];
  allSceneNumbers: number[];
  currentIndex: number;
  sceneStatuses: Record<number, SceneStatus>;
  metaAiTabId: number;
  pendingWrite: PendingWrite | null;
}

const STORAGE_KEY = 'batch';

// MV3 service workers unload after ~30s idle and wipe module state. A video
// can take well over a minute to generate, so `batch` must survive that gap —
// it's persisted to session storage and reloaded on every cold start.
let batch: BatchState | null = null;
let popupTabId: number | null = null;

const batchLoaded = browser.storage.session.get(STORAGE_KEY).then((stored) => {
  batch = (stored[STORAGE_KEY] as BatchState | undefined) ?? null;
});

async function persistBatch() {
  await browser.storage.session.set({ [STORAGE_KEY]: batch });
}

async function ensurePopupTab() {
  if (popupTabId !== null) {
    try {
      await browser.tabs.get(popupTabId);
      return;
    } catch {
      popupTabId = null;
    }
  }
  const popupUrl = browser.runtime.getURL('/popup.html');
  const tab = await browser.tabs.create({ url: popupUrl, active: false });
  popupTabId = tab.id ?? null;
}

function getStatus(): BatchStatus | null {
  if (!batch) return null;
  return {
    active: batch.active,
    mode: batch.mode,
    projectName: batch.projectName,
    currentIndex: batch.currentIndex,
    totalScenes: batch.allSceneNumbers.length,
    sceneNumbers: batch.allSceneNumbers,
    sceneStatuses: { ...batch.sceneStatuses },
    pendingWrite: batch.pendingWrite,
  };
}

function broadcastStatus() {
  browser.runtime.sendMessage({ action: Actions.BatchStatus, status: getStatus() }).catch(() => {});
}

async function resetSceneTimeout(delayInMinutes: number) {
  await browser.alarms.clear(Alarms.SceneTimeout);
  browser.alarms.create(Alarms.SceneTimeout, { delayInMinutes });
}

async function processScene(index: number) {
  if (!batch || !batch.active) return;
  if (index >= batch.scenes.length) {
    batch.active = false;
    await persistBatch();
    broadcastStatus();
    return;
  }

  batch.currentIndex = index;
  const scene = batch.scenes[index];
  batch.sceneStatuses[scene.sceneNumber] = SceneStatuses.Processing;
  await persistBatch();
  broadcastStatus();

  await resetSceneTimeout(7);

  try {
    const response = await browser.tabs.sendMessage(batch.metaAiTabId, {
      action: Actions.FillPrompt,
      prompt: scene.kind === BatchModes.Image ? scene.imagePrompt : scene.videoPrompt,
      imageData: scene.kind === BatchModes.Image ? null : scene.imageBase64,
      fileName: scene.kind === BatchModes.Image ? null : scene.imageName,
      sceneNumber: scene.sceneNumber,
      mediaType: scene.kind,
    });

    if (!response?.success) {
      throw new Error(response?.error ?? 'fill_prompt failed');
    }
  } catch {
    await browser.alarms.clear(Alarms.SceneTimeout);
    if (batch) {
      batch.sceneStatuses[scene.sceneNumber] = SceneStatuses.Error;
      await persistBatch();
      broadcastStatus();
      const nextIdx = index + 1;
      setTimeout(() => {
        if (batch?.active) processScene(nextIdx);
      }, 3000);
    }
  }
}

async function advanceAfterPendingWrite(sceneNumber: number) {
  if (!batch) return;
  batch.pendingWrite = null;
  batch.sceneStatuses[sceneNumber] = SceneStatuses.Done;
  await persistBatch();
  broadcastStatus();
  const nextIdx = batch.currentIndex + 1;
  setTimeout(() => {
    if (batch?.active) processScene(nextIdx);
  }, 3000);
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(async (message: ExtensionMessage) => {
    await batchLoaded;

    if (message.action === Actions.StartBatch) {
      const preCompleted = message.preCompletedSceneNumbers;
      const initialStatuses: Record<number, SceneStatus> = {};
      for (const n of preCompleted) initialStatuses[n] = SceneStatuses.Done;

      batch = {
        active: true,
        mode: message.mode,
        projectName: message.projectName,
        scenes: message.scenes,
        allSceneNumbers: [...preCompleted, ...message.scenes.map((s) => s.sceneNumber)].sort(
          (a, b) => a - b
        ),
        currentIndex: 0,
        sceneStatuses: initialStatuses,
        metaAiTabId: message.metaAiTabId,
        pendingWrite: null,
      };
      await persistBatch();
      ensurePopupTab().then(() => processScene(0));
      return { ok: true };
    }

    if (message.action === Actions.StopBatch) {
      if (batch) {
        batch.active = false;
        await persistBatch();
      }
      await browser.alarms.clear(Alarms.SceneTimeout);
      broadcastStatus();
      return { ok: true };
    }

    if (message.action === Actions.GetBatchStatus) {
      return getStatus();
    }

    if (message.action === Actions.DownloadVideoBrowser) {
      browser.downloads.download({ url: message.url, filename: `meta-video-${Date.now()}.mp4` }).catch(() => {});
      return;
    }

    if (message.action === Actions.DownloadVideoDirect) {
      const { url, sceneNumber } = message;
      await resetSceneTimeout(2);
      if (batch && batch.active) {
        batch.pendingWrite = { kind: BatchModes.Video, sceneNumber, url };
        await persistBatch();
        broadcastStatus();
      }
      return;
    }

    if (message.action === Actions.DownloadImagesDirect) {
      const { urls, sceneNumber } = message;
      await resetSceneTimeout(2);
      if (batch && batch.active) {
        batch.pendingWrite = { kind: BatchModes.Image, sceneNumber, urls };
        await persistBatch();
        broadcastStatus();
      }
      return;
    }

    if (message.action === Actions.WriteDone) {
      const { sceneNumber } = message;
      if (batch?.pendingWrite?.kind === BatchModes.Video && batch.pendingWrite.sceneNumber === sceneNumber) {
        await browser.alarms.clear(Alarms.SceneTimeout);
        await advanceAfterPendingWrite(sceneNumber);
      }
      return;
    }

    if (message.action === Actions.WriteDoneImages) {
      const { sceneNumber } = message;
      if (batch?.pendingWrite?.kind === BatchModes.Image && batch.pendingWrite.sceneNumber === sceneNumber) {
        await browser.alarms.clear(Alarms.SceneTimeout);
        await advanceAfterPendingWrite(sceneNumber);
      }
      return;
    }

    return;
  });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    await batchLoaded;
    if (alarm.name === Alarms.SceneTimeout && batch?.active) {
      const scene = batch.scenes[batch.currentIndex];
      if (scene && batch.sceneStatuses[scene.sceneNumber] === SceneStatuses.Processing) {
        batch.sceneStatuses[scene.sceneNumber] = SceneStatuses.Error;
        batch.pendingWrite = null;
        await persistBatch();
        broadcastStatus();
        const nextIdx = batch.currentIndex + 1;
        setTimeout(() => {
          if (batch?.active) processScene(nextIdx);
        }, 1000);
      }
    }
  });
});
