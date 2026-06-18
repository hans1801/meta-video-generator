export const ProjectDirs = {
  Videos: 'videos',
  Images: 'images',
} as const;

export const ProjectFiles = {
  Script: 'script.json',
} as const;

export const sceneImageName = (n: number) => `scene_${n}.png`;
export const sceneVideoName = (n: number) => `scene_${n}.mp4`;
export const SCENE_VIDEO_PATTERN = /^scene_(\d+)\.mp4$/;

export const VIDEO_PROMPT_PREFIX = 'Animate this image.';
