import { Actions, SceneStatuses } from '../lib/types';
import type { SceneStatus, BatchStatus, SceneInput, ExtensionMessage } from '../lib/types';

export type { BatchStatus };

interface BatchState {
  active: boolean;
  projectName: string;
  scenes: SceneInput[];
  allSceneNumbers: number[];
  currentIndex: number;
  sceneStatuses: Record<number, SceneStatus>;
  metaAiTabId: number;
  pendingWrite: { sceneNumber: number; url: string } | null;
}

let batch: BatchState | null = null;
let popupTabId: number | null = null;

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

async function processScene(index: number) {
  if (!batch || !batch.active) return;
  if (index >= batch.scenes.length) {
    batch.active = false;
    broadcastStatus();
    return;
  }

  batch.currentIndex = index;
  const scene = batch.scenes[index];
  batch.sceneStatuses[scene.sceneNumber] = SceneStatuses.Processing;
  broadcastStatus();

  await browser.alarms.clear('scene_timeout');
  browser.alarms.create('scene_timeout', { delayInMinutes: 7 });

  try {
    const response = await browser.tabs.sendMessage(batch.metaAiTabId, {
      action: Actions.FillPrompt,
      prompt: scene.videoPrompt,
      imageData: scene.imageBase64,
      fileName: scene.imageName,
      sceneNumber: scene.sceneNumber,
      projectName: batch.projectName,
    });

    if (!response?.success) {
      throw new Error(response?.error ?? 'fill_prompt failed');
    }
  } catch {
    await browser.alarms.clear('scene_timeout');
    if (batch) {
      batch.sceneStatuses[scene.sceneNumber] = SceneStatuses.Error;
      broadcastStatus();
      const nextIdx = index + 1;
      setTimeout(() => {
        if (batch?.active) processScene(nextIdx);
      }, 3000);
    }
  }
}

function advanceAfterWrite(sceneNumber: number) {
  if (!batch) return;
  batch.pendingWrite = null;
  batch.sceneStatuses[sceneNumber] = SceneStatuses.Done;
  broadcastStatus();
  const nextIdx = batch.currentIndex + 1;
  setTimeout(() => {
    if (batch?.active) processScene(nextIdx);
  }, 3000);
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    if (message.action === Actions.StartBatch) {
      const preCompleted = message.preCompletedSceneNumbers;
      const initialStatuses: Record<number, SceneStatus> = {};
      for (const n of preCompleted) initialStatuses[n] = SceneStatuses.Done;

      batch = {
        active: true,
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
      ensurePopupTab().then(() => processScene(0));
      sendResponse({ ok: true });
      return false;
    }

    if (message.action === Actions.StopBatch) {
      if (batch) batch.active = false;
      browser.alarms.clear('scene_timeout');
      broadcastStatus();
      sendResponse({ ok: true });
      return false;
    }

    if (message.action === Actions.GetBatchStatus) {
      sendResponse(getStatus());
      return false;
    }

    if (message.action === Actions.DownloadVideoDirect) {
      const { url, sceneNumber } = message;
      browser.alarms.clear('scene_timeout');

      if (batch && batch.active) {
        batch.pendingWrite = { sceneNumber, url };
        broadcastStatus();
      }
      return false;
    }

    if (message.action === Actions.WriteDone) {
      const { sceneNumber } = message;
      if (batch?.pendingWrite?.sceneNumber === sceneNumber) {
        advanceAfterWrite(sceneNumber);
      }
      return false;
    }

    return false;
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'scene_timeout' && batch?.active) {
      const scene = batch.scenes[batch.currentIndex];
      if (scene && batch.sceneStatuses[scene.sceneNumber] === SceneStatuses.Processing) {
        batch.sceneStatuses[scene.sceneNumber] = SceneStatuses.Error;
        broadcastStatus();
        const nextIdx = batch.currentIndex + 1;
        setTimeout(() => {
          if (batch?.active) processScene(nextIdx);
        }, 1000);
      }
    }
  });
});
