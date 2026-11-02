import type { Row, Asset } from "../../services/types";
export interface MixConfig {
  enabled: boolean;
  message?: string;
}
export const mixState = {
  config: null as MixConfig | null,
  assets: [] as Array<Row<Asset> & { isImage: boolean }>,
  script: "",
  style: "clean",
  ratio: "9:16",
  resolution: "720p",
  duration: 30,
  autoScenes: true,
  transcribe: false,
  rewrite: false,
  narration: false,
  captions: false,
  keepOriginalAudio: true,
  musicVolume: 20,
  voices: [] as string[],
  voiceIndex: 0,
  selectedVoice: "",
  ttsModel: "",
  modelNames: [] as string[],
  modelIndex: 0,
  musicNames: ["不使用背景音乐"],
  musicIndex: 0,
  musicId: "",
  musicLabel: "不使用背景音乐",
  loading: true,
  loadError: "",
  busy: false,
  uploading: false,
  restoring: false,
  restoreError: "",
};
