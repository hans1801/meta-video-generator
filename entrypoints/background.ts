import type { SceneStatus, BatchStatus } from '../lib/types';

export type { BatchStatus };

interface SceneData {
  sceneNumber: number;
  imageBase64: string;
  imageName: string;
  videoPrompt: string;
}

interface BatchState {
  active: boolean;
  projectName: string;
  scenes: SceneData[];
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
    totalScenes: batch.scenes.length,
    sceneNumbers: batch.scenes.map(s => s.sceneNumber),
    sceneStatuses: { ...batch.sceneStatuses },
    pendingWrite: batch.pendingWrite,
  };
}

function broadcastStatus() {
  browser.runtime.sendMessage({ action: 'batch_status', status: getStatus() }).catch(() => {});
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
  batch.sceneStatuses[scene.sceneNumber] = 'processing';
  broadcastStatus();

  await browser.alarms.clear('scene_timeout');
  browser.alarms.create('scene_timeout', { delayInMinutes: 7 });

  try {
    const response = await browser.tabs.sendMessage(batch.metaAiTabId, {
      action: 'fill_prompt',
      prompt: scene.videoPrompt,
      imageData: scene.imageBase64,
      fileName: scene.imageName,
      sceneNumber: scene.sceneNumber,
      projectName: batch.projectName,
    });

    if (!response?.success) {
      throw new Error(response?.error ?? 'fill_prompt failed');
    }
  } catch (err) {
    await browser.alarms.clear('scene_timeout');
    if (batch) {
      batch.sceneStatuses[scene.sceneNumber] = 'error';
      broadcastStatus();
      const nextIdx = index + 1;
      setTimeout(() => { if (batch?.active) processScene(nextIdx); }, 3000);
    }
  }
}

function advanceAfterWrite(sceneNumber: number) {
  if (!batch) return;
  batch.pendingWrite = null;
  batch.sceneStatuses[sceneNumber] = 'done';
  broadcastStatus();
  const nextIdx = batch.currentIndex + 1;
  setTimeout(() => { if (batch?.active) processScene(nextIdx); }, 3000);
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'start_batch') {
      batch = {
        active: true,
        projectName: message.projectName,
        scenes: message.scenes,
        currentIndex: 0,
        sceneStatuses: {},
        metaAiTabId: message.metaAiTabId,
        pendingWrite: null,
      };
      ensurePopupTab().then(() => processScene(0));
      sendResponse({ ok: true });
      return false;
    }

    if (message.action === 'stop_batch') {
      if (batch) batch.active = false;
      browser.alarms.clear('scene_timeout');
      broadcastStatus();
      sendResponse({ ok: true });
      return false;
    }

    if (message.action === 'get_batch_status') {
      sendResponse(getStatus());
      return false;
    }

    if (message.action === 'download_video_direct') {
      const { url, sceneNumber } = message;
      browser.alarms.clear('scene_timeout');

      if (batch && batch.active) {
        batch.pendingWrite = { sceneNumber, url };
        broadcastStatus();
      }
      return false;
    }

    if (message.action === 'write_done') {
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
      if (scene && batch.sceneStatuses[scene.sceneNumber] === 'processing') {
        batch.sceneStatuses[scene.sceneNumber] = 'error';
        broadcastStatus();
        const nextIdx = batch.currentIndex + 1;
        setTimeout(() => { if (batch?.active) processScene(nextIdx); }, 1000);
      }
    }
  });
});
