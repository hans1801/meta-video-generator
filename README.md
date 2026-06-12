# Meta Video Generator

This project is a Chrome extension developed with [WXT](https://wxt.dev/) and React.

## Prerequisites

- Node.js
- npm or pnpm

## Installation

Install the project dependencies by running:

```bash
npm install
# or
pnpm install
```

## Development Mode (Dev)

To run the project in development mode and see changes in real-time, simply run:

```bash
npm run dev
# or
pnpm run dev
```

**What does this command do?**
- Starts the local development server with Hot Module Replacement (HMR).
- **Automatically opens a new browser window** configured as a test profile, with your extension already installed and ready to use.

*Note: If you close the test browser, you can press `o + enter` in the terminal where the script is running to open it again.*

## Build and Manual Load in Chrome

If you want to compile the final version of the extension or install it in your main Chrome profile:

1. Run the build command:

   ```bash
   npm run build
   # or
   pnpm run build
   ```

2. This will generate a folder named `.output/chrome-mv3` (or similar) in the root of your project.
3. Open your Chrome browser and go to: `chrome://extensions/`
4. Enable **Developer mode** (toggle in the top right corner).
5. Click on the **Load unpacked** button in the top left.
6. Select the `.output/chrome-mv3` folder that was just generated.

Done! The extension will now be installed in your main browser.
