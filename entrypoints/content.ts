import { Actions, BatchModes } from '../lib/types';
import type { ExtensionMessage, ContentResponse } from '../lib/types';

function dataURLtoFile(dataurl: string, filename: string) {
  const arr = dataurl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], filename, { type: mime });
}

function fillTextInput(prompt: string) {
  const inputDiv = document.querySelector(
    '[data-testid="composer-input"][contenteditable="true"]'
  );
  if (inputDiv && prompt) {
    (inputDiv as HTMLElement).focus();
    document.execCommand('insertText', false, prompt);
  }
}

function clickSendButton(): boolean {
  const btn = document.querySelector('[data-testid="composer-send-button"]');
  if (!btn) return false;
  (btn as HTMLButtonElement).click();
  return true;
}

function attachImageToInput(imageData: string, fileName: string): boolean {
  const file = dataURLtoFile(imageData, fileName);
  const fileInput = document.querySelector(
    'input[type="file"][accept*="image"]'
  ) as HTMLInputElement | null;
  if (!fileInput) return false;
  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function pollForVideos(
  initialCount: number,
  sceneNumber: number,
  projectName: string
) {
  const getVideos = () =>
    document.querySelectorAll('[data-testid="generated-video"] video');
  let attempts = 0;
  const maxAttempts = 150;

  const interval = setInterval(async () => {
    attempts++;
    const current = getVideos();
    const newEls = current.length > initialCount ? Array.from(current).slice(initialCount) : [];
    const allReady =
      newEls.length > 0 &&
      newEls.every(
        (el) =>
          (el as HTMLVideoElement).readyState >= 2 ||
          !!el.closest('[data-testid="generated-video"]')?.getAttribute('data-video-url')
      );
    if (allReady) {
      clearInterval(interval);
      for (const videoEl of newEls) {
        const el = videoEl as HTMLVideoElement;
        const url =
          el.src ||
          el.closest('[data-testid="generated-video"]')?.getAttribute('data-video-url') ||
          '';
        if (url) {
          await browser.runtime.sendMessage({
            action: Actions.DownloadVideoDirect,
            url,
            sceneNumber,
            projectName,
          });
        }
      }
    } else if (attempts >= maxAttempts) {
      clearInterval(interval);
    }
  }, 2000);
}

function pollForImages(
  initialCount: number,
  sceneNumber: number,
  projectName: string
) {
  const getImages = () =>
    document.querySelectorAll('img[data-testid="generated-image"]');
  let attempts = 0;
  const maxAttempts = 90;

  const interval = setInterval(async () => {
    attempts++;
    const current = getImages();
    const newImgs = current.length >= initialCount + 4 ? Array.from(current).slice(0, 4) as HTMLImageElement[] : [];
    const allReady = newImgs.length === 4 && newImgs.every((img) => img.complete && img.naturalWidth > 0);
    if (allReady) {
      clearInterval(interval);
      const urls: string[] = [];
      for (const img of newImgs) {
        if (img.src) urls.push(img.src);
      }
      if (urls.length > 0) {
        await browser.runtime.sendMessage({
          action: Actions.DownloadImagesDirect,
          urls,
          sceneNumber,
          projectName,
        });
      }
    } else if (attempts >= maxAttempts) {
      clearInterval(interval);
    }
  }, 2000);
}

function handleVideoMode(
  prompt: string,
  imageData: string | null,
  fileName: string | null,
  sceneNumber: number | undefined,
  projectName: string | undefined,
  sendResponse: (r: ContentResponse) => void
) {
  const run = () => {
    fillTextInput(prompt);
    const initialCount = document.querySelectorAll(
      '[data-testid="generated-video"] video'
    ).length;
    setTimeout(() => {
      if (!clickSendButton()) {
        sendResponse({ success: false, error: 'Prompt written, but send button not found.' });
        return;
      }
      sendResponse({ success: true, message: 'Sent! Waiting for video...' });
      if (sceneNumber !== undefined && projectName) {
        pollForVideos(initialCount, sceneNumber, projectName);
      }
    }, 500);
  };

  if (imageData) {
    const ok = attachImageToInput(imageData, fileName || 'upload.png');
    if (!ok) {
      sendResponse({ success: false, error: 'File input not found on page.' });
      return;
    }
    setTimeout(run, 1500);
  } else {
    run();
  }
}

function handleImageMode(
  prompt: string,
  sceneNumber: number | undefined,
  projectName: string | undefined,
  sendResponse: (r: ContentResponse) => void
) {
  fillTextInput(prompt);
  const initialCount = document.querySelectorAll(
    'img[data-testid="generated-image"]'
  ).length;
  setTimeout(() => {
    if (!clickSendButton()) {
      sendResponse({ success: false, error: 'Prompt written, but send button not found.' });
      return;
    }
    sendResponse({ success: true, message: 'Sent! Waiting for images...' });
    if (sceneNumber !== undefined && projectName) {
      pollForImages(initialCount, sceneNumber, projectName);
    }
  }, 500);
}

export default defineContentScript({
  matches: ['*://*.meta.ai/*', '*://meta.ai/*'],
  main() {
    browser.runtime.onMessage.addListener(
      (message: ExtensionMessage, _sender, sendResponse: (r: ContentResponse) => void) => {
        if (message.action !== Actions.FillPrompt) return false;

        const { prompt, imageData, fileName, sceneNumber, projectName, mediaType } = message;

        if (mediaType === BatchModes.Image) {
          handleImageMode(prompt, sceneNumber, projectName, sendResponse);
        } else {
          handleVideoMode(prompt, imageData, fileName, sceneNumber, projectName, sendResponse);
        }

        return true;
      }
    );
  },
});
