import type { ModelSettings } from "./models/types";
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
  coverAssetId?: string;
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
export interface Job {
  deleted?: boolean;
  reviewStatus?: string;
  costUnits?: number;
  billingState?: string;
  stage?: string;
  actualDuration?: number;
  outputScript?: string;
  modelName?: string;
  retryable: boolean;
  id: string;
  userId: string;
  input: {
    kind: string;
    prompt: string;
    model: string;
    resolution: string;
    ratio: string;
    duration: number;
    assets: string[];
    templateId?: string;
  };
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
  settings?: ModelSettings;
  referenceTypes: string[];
  recentJobs: number;
  key: string;
  published: boolean;
  available: boolean;
  sort: number;
  points: number;
  creditCost: number;
  durations: number[];
  qualities: string[];
  modes: string[];
  operations: string[];
  paramsSchema: Record<string, unknown>;
  priceModifiers: Record<string, unknown>;
  syncedAt: string;
  id: string;
  name: string;
  kind: string;
  resolutions: string[];
  ratios: string[];
  demo: boolean;
}
export interface Config {
  relayConfigured: boolean;
  mixAvailable: boolean;
  demo: boolean;
  demoLogin: boolean;
  storage: string;
  models: Model[];
  categories: string[];
}
export interface Overview {
  relayConfigured: boolean;
  users: number;
  templates: number;
  tasks: number;
  states: Record<string, number>;
  demo: boolean;
  storage: string;
  clusterReady: boolean;
  scope: string;
}
export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch("/api" + path, {
      credentials: "include",
      ...init,
      headers: {
        ...(init.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...init.headers,
      },
    });
  } catch (e) {
    if (init.signal?.aborted) throw e;
    throw new APIError(0, "连接失败，请检查网络后重试");
  }
  if (r.status === 401 && path !== "/admin/login")
    window.dispatchEvent(new Event("session-expired"));
  const data = await r.json().catch(() => {
    throw new APIError(r.status, "服务暂时不可用，请稍后重试");
  });
  if (!r.ok) {
    throw new APIError(r.status, data.error || "请求失败");
  }
  return data;
}
export const stateText: Record<string, string> = {
  queued: "排队中",
  running: "生成中",
  succeeded: "已完成",
  failed: "失败",
};
export const kindText: Record<string, string> = {
  video: "视频生成",
  image: "图片生成",
  mix: "视频混剪",
  chat: "Agent 对话",
};
export const date = (s: string) =>
  new Date(s).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
