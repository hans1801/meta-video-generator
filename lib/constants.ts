export const ProjectDirs = {
  Videos: 'videos',
  Images: 'images',
} as const;

export const ProjectFiles = {
  Script: 'script.json',
} as const;

export const sceneVideoName = (n: number) => `scene_${String(n).padStart(4, '0')}.mp4`;
export const SCENE_VIDEO_PATTERN = /^scene_(\d+)\.mp4$/;
export const SCENE_IMAGE_FOLDER_PATTERN = /^scene_(\d+)$/;

export const sceneImageSetFolder = (n: number) => `scene_${String(n).padStart(4, '0')}`;
export const sceneGeneratedImageName = (i: number) => `image_${String(i + 1).padStart(4, '0')}.jpeg`;
export const sceneRefImageName = (n: number) => `scene_${String(n).padStart(4, '0')}.jpeg`;

export const VIDEO_PROMPT_PREFIX = 'Animate this image.';

export const Alarms = {
  SceneTimeout: 'scene_timeout',
} as const;
