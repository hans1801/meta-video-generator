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
  sceneStatuses: Record<number, 'pending' | 'processing' | 'done' | 'error'>;
  metaAiTabId: number;
}

export interface BatchStatus {
  active: boolean;
  projectName: string;
  currentIndex: number;
  totalScenes: number;
  sceneNumbers: number[];
  sceneStatuses: Record<number, 'pending' | 'processing' | 'done' | 'error'>;
}

let batch: BatchState | null = null;
let pendingDownload: { sceneNumber: number; projectName: string } | null = null;

function getStatus(): BatchStatus | null {
  if (!batch) return null;
  return {
    active: batch.active,
    projectName: batch.projectName,
    currentIndex: batch.currentIndex,
    totalScenes: batch.scenes.length,
    sceneNumbers: batch.scenes.map(s => s.sceneNumber),
    sceneStatuses: { ...batch.sceneStatuses },
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
    // Content script is now polling; download event will trigger next step
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

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'start_batch') {
      pendingDownload = null;
      batch = {
        active: true,
        projectName: message.projectName,
        scenes: message.scenes,
        currentIndex: 0,
        sceneStatuses: {},
        metaAiTabId: message.metaAiTabId,
      };
      processScene(0);
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

    if (message.action === 'set_pending_download') {
      pendingDownload = { sceneNumber: message.sceneNumber, projectName: message.projectName };
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

  chrome.downloads.onDeterminingFilename.addListener(
    (downloadItem: chrome.downloads.DownloadItem, suggest: (suggestion?: chrome.downloads.FilenameSuggestion) => void) => {
      if (
        pendingDownload &&
        (downloadItem.mime?.startsWith('video/') ||
          downloadItem.filename.endsWith('.mp4') ||
          downloadItem.filename.endsWith('.webm'))
      ) {
        const { sceneNumber, projectName } = pendingDownload;
        pendingDownload = null;

        suggest({
          filename: `${projectName}/videos/scene_${sceneNumber}.mp4`,
          conflictAction: 'overwrite',
        });

        browser.alarms.clear('scene_timeout');

        if (batch && batch.active) {
          batch.sceneStatuses[sceneNumber] = 'done';
          broadcastStatus();
          const nextIdx = batch.currentIndex + 1;
          setTimeout(() => { if (batch?.active) processScene(nextIdx); }, 3000);
        }
      }
    }
  );
});
