import type { Row, Asset } from "../../services/types";
export interface MixConfig {
  enabled: boolean;
  message?: string;
}
// Choices shown as tiles; values are what a mix job would send.
const choices = {
  styles: [
    { value: "clean", label: "自然剪辑", icon: "film", image: "" },
    { value: "rhythm", label: "快节奏", icon: "chart-bar", image: "" },
    { value: "cinematic", label: "电影色调", icon: "movie-clapper", image: "" },
  ],
  ratios: [
    { value: "9:16", shape: "portrait" },
    { value: "16:9", shape: "wide" },
    { value: "1:1", shape: "square" },
  ],
  features: [
    { field: "transcribe", label: "语音转文字", glyph: "mic" },
    { field: "rewrite", label: "AI 改写文案", glyph: "rewrite" },
    { field: "narration", label: "AI 配音", glyph: "voice" },
    { field: "captions", label: "自动字幕", glyph: "subtitle" },
  ],
};
export const mixState = {
  ...choices,
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
  // Mirrors the four feature flags for the tiles (WXML can't index data).
  on: { transcribe: false, rewrite: false, narration: false, captions: false } as Record<string, boolean>,
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
