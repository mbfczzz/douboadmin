import type { Row, Asset } from "../../services/types";
export interface MixConfig {
  enabled: boolean;
  asr: boolean;
  rewrite: boolean;
  tts: boolean;
  ttsModel: string;
  rewriteModel: string;
  voiceModels: { id: string; name: string; voices: string[] | null }[];
  points: number;
  billingEnabled: boolean;
}
export interface Music {
  title: string;
  assetId: string;
  url: string;
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
  music: [] as Row<Music>[],
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
