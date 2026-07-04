import { Actions, BatchModes } from '../lib/types';
import type { ExtensionMessage, ContentResponse } from '../lib/types';

const COMPOSER_SELECTOR = '[data-testid="composer-input"][contenteditable="true"]';
const SEND_BUTTON_SELECTOR = '[data-testid="composer-send-button"]';
const FILE_INPUT_SELECTOR = 'input[type="file"][accept*="image"]';
const ELEMENT_WAIT_TIMEOUT_MS = 15000;
const ELEMENT_WAIT_INTERVAL_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function waitFor<T>(check: () => T | null | undefined, timeoutMs = ELEMENT_WAIT_TIMEOUT_MS): Promise<T | null> {
  const existing = check();
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const result = check();
      if (result || Date.now() - start >= timeoutMs) {
        clearInterval(interval);
        resolve(result ?? null);
      }
    }, ELEMENT_WAIT_INTERVAL_MS);
  });
}

function waitForElement<T extends Element>(selector: string, timeoutMs = ELEMENT_WAIT_TIMEOUT_MS): Promise<T | null> {
  return waitFor(() => document.querySelector<T>(selector), timeoutMs);
}

function waitForEnabledButton(selector: string, timeoutMs = ELEMENT_WAIT_TIMEOUT_MS): Promise<HTMLButtonElement | null> {
  return waitFor(() => {
    const btn = document.querySelector<HTMLButtonElement>(selector);
    return btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true' ? btn : null;
  }, timeoutMs);
}

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

async function fillTextInput(prompt: string): Promise<boolean> {
  const inputDiv = await waitForElement<HTMLElement>(COMPOSER_SELECTOR);
  if (!inputDiv || !prompt) return false;
  inputDiv.focus();
  document.execCommand('insertText', false, prompt);
  return true;
}

async function clickSendButton(): Promise<boolean> {
  const btn = await waitForEnabledButton(SEND_BUTTON_SELECTOR);
  if (!btn) return false;
  btn.click();
  return true;
}

async function attachImageToInput(imageData: string, fileName: string): Promise<boolean> {
  const fileInput = await waitForElement<HTMLInputElement>(FILE_INPUT_SELECTOR);
  if (!fileInput) return false;
  const file = dataURLtoFile(imageData, fileName);
  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function pollForVideos(initialCount: number, sceneNumber?: number) {
  const getVideos = () =>
    document.querySelectorAll('[data-testid="generated-video"] video');
  let attempts = 0;
  const maxAttempts = 150;

  const interval = setInterval(async () => {
    attempts++;
    const current = getVideos();
    const newCount = current.length - initialCount;
    const newEls = newCount > 0 ? Array.from(current).slice(0, newCount) : [];
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
        if (!url) continue;
        if (sceneNumber !== undefined) {
          await browser.runtime.sendMessage({ action: Actions.DownloadVideoDirect, url, sceneNumber });
        } else {
          await browser.runtime.sendMessage({ action: Actions.DownloadVideoBrowser, url });
        }
      }
    } else if (attempts >= maxAttempts) {
      clearInterval(interval);
    }
  }, 2000);
}

function pollForImages(initialCount: number, sceneNumber: number) {
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
      const urls = newImgs.map((img) => img.src).filter(Boolean);
      if (urls.length > 0) {
        await browser.runtime.sendMessage({
          action: Actions.DownloadImagesDirect,
          urls,
          sceneNumber,
        });
      }
    } else if (attempts >= maxAttempts) {
      clearInterval(interval);
    }
  }, 2000);
}

async function handleVideoMode(
  prompt: string,
  imageData: string | null,
  fileName: string | null,
  sceneNumber: number | undefined,
  sendResponse: (r: ContentResponse) => void
) {
  if (imageData) {
    const attached = await attachImageToInput(imageData, fileName || 'upload.png');
    if (!attached) {
      sendResponse({ success: false, error: 'File input not found on page.' });
      return;
    }
    await sleep(1500);
  }

  const initialCount = document.querySelectorAll('[data-testid="generated-video"] video').length;

  const filled = await fillTextInput(prompt);
  if (!filled) {
    sendResponse({ success: false, error: 'Composer input not found on page.' });
    return;
  }

  const sent = await clickSendButton();
  if (!sent) {
    sendResponse({ success: false, error: 'Prompt written, but send button not found.' });
    return;
  }

  sendResponse({ success: true, message: 'Sent! Waiting for video...' });
  pollForVideos(initialCount, sceneNumber);
}

async function handleImageMode(
  prompt: string,
  sceneNumber: number | undefined,
  sendResponse: (r: ContentResponse) => void
) {
  const initialCount = document.querySelectorAll('img[data-testid="generated-image"]').length;

  const filled = await fillTextInput(prompt);
  if (!filled) {
    sendResponse({ success: false, error: 'Composer input not found on page.' });
    return;
  }

  const sent = await clickSendButton();
  if (!sent) {
    sendResponse({ success: false, error: 'Prompt written, but send button not found.' });
    return;
  }

  sendResponse({ success: true, message: 'Sent! Waiting for images...' });
  if (sceneNumber !== undefined) {
    pollForImages(initialCount, sceneNumber);
  }
}

export default defineContentScript({
  matches: ['*://*.meta.ai/*', '*://meta.ai/*'],
  main() {
    browser.runtime.onMessage.addListener(
      (message: ExtensionMessage, _sender, sendResponse: (r: ContentResponse) => void) => {
        if (message.action !== Actions.FillPrompt) return false;

        const { prompt, imageData, fileName, sceneNumber, mediaType } = message;

        if (mediaType === BatchModes.Image) {
          handleImageMode(prompt, sceneNumber, sendResponse);
        } else {
          handleVideoMode(prompt, imageData, fileName, sceneNumber, sendResponse);
        }

        return true;
      }
    );
  },
});
