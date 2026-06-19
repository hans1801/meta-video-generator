export const ProjectDirs = {
  Videos: 'videos',
  Images: 'images',
} as const;

export const ProjectFiles = {
  Script: 'script.json',
} as const;

export const sceneVideoName = (n: number) => `scene_${n}.mp4`;
export const SCENE_VIDEO_PATTERN = /^scene_(\d+)\.mp4$/;
export const SCENE_IMAGE_FOLDER_PATTERN = /^scene_(\d+)$/;

export const sceneImageSetFolder = (n: number) => `scene_${n}`;
export const sceneGeneratedImageName = (i: number) => `image_${i + 1}.jpeg`;
export const sceneRefImageName = (n: number) => `scene_${n}.jpeg`;

export const VIDEO_PROMPT_PREFIX = 'Animate this image.';

export const Alarms = {
  SceneTimeout: 'scene_timeout',
} as const;
