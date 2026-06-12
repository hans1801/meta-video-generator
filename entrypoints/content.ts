function dataURLtoFile(dataurl: string, filename: string) {
  const arr = dataurl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

export default defineContentScript({
  matches: ['*://*.meta.ai/*', '*://meta.ai/*'],
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.action === 'fill_prompt') {
        const { prompt, imageData, fileName, sceneNumber, projectName } = message;

        const attachAndSend = () => {
          const inputDiv = document.querySelector(
            '[data-testid="composer-input"][contenteditable="true"]'
          );

          if (inputDiv && prompt) {
            (inputDiv as HTMLElement).focus();
            const success = document.execCommand('insertText', false, prompt);
            if (!success) {
              inputDiv.textContent = prompt;
              inputDiv.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }

          const getCompletedVideos = () =>
            document.querySelectorAll('[data-testid="generated-video"] video');
          const initialVideoCount = getCompletedVideos().length;

          setTimeout(() => {
            const sendBtn = document.querySelector('[data-testid="composer-send-button"]');
            if (sendBtn) {
              (sendBtn as HTMLButtonElement).click();
              sendResponse({ success: true, message: 'Sent! Waiting for video...' });

              let attempts = 0;
              const maxAttempts = 150;

              const interval = setInterval(async () => {
                attempts++;
                const currentVideos = getCompletedVideos();

                if (currentVideos.length > initialVideoCount) {
                  clearInterval(interval);
                  const newVideosCount = currentVideos.length - initialVideoCount;

                  for (let i = 0; i < newVideosCount; i++) {
                    const videoEl = currentVideos[i];
                    let container: HTMLElement | null = videoEl.parentElement;
                    for (let j = 0; j < 8; j++) {
                      if (container?.querySelector('button[aria-label="Download"]')) break;
                      container = container?.parentElement ?? null;
                    }

                    if (container) {
                      const downloadBtn = container.querySelector(
                        'button[aria-label="Download"]:not([disabled])'
                      ) as HTMLButtonElement | null;
                      if (downloadBtn) {
                        if (sceneNumber !== undefined && projectName) {
                          await browser.runtime.sendMessage({
                            action: 'set_pending_download',
                            sceneNumber,
                            projectName,
                          });
                        }
                        downloadBtn.click();
                      }
                    }
                  }
                } else if (attempts >= maxAttempts) {
                  clearInterval(interval);
                }
              }, 2000);
            } else {
              sendResponse({ success: false, error: 'Prompt written, but send button not found.' });
            }
          }, 500);
        };

        if (imageData) {
          const file = dataURLtoFile(imageData, fileName || 'upload.png');
          const fileInput = document.querySelector(
            'input[type="file"][accept*="image"]'
          ) as HTMLInputElement | null;

          if (fileInput) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            const event = new Event('change', { bubbles: true });
            fileInput.dispatchEvent(event);
            setTimeout(attachAndSend, 1500);
          } else {
            sendResponse({ success: false, error: 'File input not found on page.' });
          }
        } else {
          attachAndSend();
        }

        return true;
      }
    });
  },
});
