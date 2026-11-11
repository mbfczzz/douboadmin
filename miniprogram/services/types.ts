export interface NativeFailure {
  errCode?: number | string;
  errMsg?: string;
  err_code?: number | string;
  err_msg?: string;
}
export type PendingPayment = { id: string; owner: string; deferred?: boolean };
export interface ChatMessage {
  id: string;
  role: string;
  text: string;
  pending?: boolean;
}
export interface JobPage {
  items: Job[];
  total: number;
  page: number;
  size: number;
}
export interface ResponseMeta {
  code?: string;
  error?: string;
  access?: { canBrowse?: boolean };
  activationRequired?: boolean;
}

export interface Row<T = Record<string, unknown>> {
  id: string;
  owner?: string;
  version: number;
  data: T;
  createdAt: string;
}
export interface Template {
  model: string;
  resolution: string;
  ratio: string;
  duration: number;
  quality: string;
  mode: string;
  family: string;
  preview?: string;
  title: string;
  category: string;
  kind: string;
  cover: string;
  prompt: string;
  description: string;
  published: boolean;
  sort: number;
  requiredImages: number;
}
export interface Asset {
  name: string;
  url: string;
  key: string;
  type: string;
  size: number;
}
export interface Input {
  expectedCostUnits?: number;
  voice?: string;
  purpose?: string;
  sourceId?: string;
  mix?: {
    autoScenes: boolean;
    transcribe: boolean;
    rewrite: boolean;
    narration: boolean;
    voice: string;
    ttsModel: string;
    rewriteModel: string;
    captions: boolean;
    musicId: string;
    musicVolume: number;
    keepOriginalAudio: boolean;
  };
  quality?: string;
  mode?: string;
  kind: string;
  prompt: string;
  model: string;
  resolution: string;
  ratio: string;
  duration: number;
  assets: string[];
  templateId?: string;
  style?: string;
  parentId?: string;
}
export interface Job {
  costUnits?: number;
  billingState?: string;
  stage?: string;
  resultAssetId?: string;
  deleted?: boolean;
  modelName?: string;
  retryable?: boolean;
  id: string;
  userId: string;
  input: Input;
  status: string;
  progress: number;
  result?: string;
  error?: string;
  demo: boolean;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}
export interface Model {
  resolutionByMode?: Record<string, string[]>;
  referenceRules?: Record<
    string,
    Record<string, { minCount?: number; maxCount: number; maxSizeMB: number }>
  >;
  icon?: string;
  settings?: {
    defaultPrompt?: string;
    ideas?: string[];
    maxPromptChars?: number;
    maxRefImages?: number;
    maxRefImageSizeMB?: number;
    refLimits?: Record<string, number>;
    omniReferences?: Record<string, boolean>;
    description?: string;
    estSeconds?: number;
    badges?: { text: string; tone: string }[];
  };
  referenceTypes?: string[];
  durations?: number[];
  qualities?: string[];
  modes?: string[];
  id: string;
  name: string;
  kind: string;
  resolutions: string[];
  ratios: string[];
  demo: boolean;
}
export interface Config {
  brandIcon?: string;
  activationRequired?: boolean;
  completionTemplateId?: string;
  relayConfigured: boolean;
  mixAvailable: boolean;
  mixMessage?: string;
  demo: boolean;
  demoLogin: boolean;
  wechatLogin: boolean;
  models: Model[];
  categories: string[];
  storage: string;
}
export interface Profile {
  name?: string;
  phone?: string;
  verifiedPhone?: string;
  avatarId?: string;
  avatarUrl?: string;
  authProvider?: string;
  nickname: string;
  bio: string;
}
export interface Me {
  profile: Row<Profile>;
  works: number;
  running: number;
  favorites: number;
}
