import type { ModelSettings } from "./models/types";
import {
  requestConfirmation,
  type ConfirmationOptions,
} from "./confirmation/request";
import { needsConfirmation, confirmationPlan } from "./confirmation/plan";
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
  costUnits?: number;
  billingState?: string;
  stage?: string;
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
  thumbnailUrl?: string;
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
    public field?: string,
  ) {
    super(message);
  }
}
export type APIInit = RequestInit & {
  confirmation?: false | ConfirmationOptions;
};
export async function api<T>(path: string, options: APIInit = {}): Promise<T> {
  const { confirmation, ...init } = options;
  let body: unknown;
  if (typeof init.body === "string") {
    try {
      body = JSON.parse(init.body);
    } catch {
      /* Validation belongs to the server. */
    }
  }
  if (
    confirmation !== false &&
    needsConfirmation(path, (init.method || "GET").toUpperCase(), body)
  ) {
    const plan = confirmationPlan(path, body, confirmation);
    // An edit that changes nothing is not sent (no empty approval, no write).
    if (confirmation && confirmation.before !== undefined && !plan.rows.length)
      throw new APIError(0, "没有需要保存的修改");
    const approved = await requestConfirmation(plan, init.signal);
    if (!approved) throw new APIError(0, "");
  }
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
  // A role edited by a super admin shows up as 403 here; refresh the menus.
  if (r.status === 403 && path.startsWith("/admin/") && path !== "/admin/me")
    window.dispatchEvent(new Event("permissions-changed"));
  const data = await r.json().catch(() => {
    throw new APIError(r.status, "服务暂时不可用，请稍后重试");
  });
  if (!r.ok) {
    throw new APIError(r.status, data.error || "请求失败", data.field);
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
  audio: "配音",
};
// One date format across the admin, in Beijing time: 2026-11-02 09:00
// (with seconds where precision matters, e.g. payments and audit trails).
export const date = (s?: string | null, seconds = false) => {
  const d = s ? new Date(s) : undefined;
  // Go's zero time (0001-01-01) means "never", not a real date.
  if (!d || Number.isNaN(d.getTime()) || d.getUTCFullYear() < 2000) return "—";
  return (
    d
      .toLocaleString("sv-SE", { timeZone: "Asia/Shanghai", hour12: false })
      .slice(0, seconds ? 19 : 16)
      // Non-breaking space and hyphens: a date never splits across lines.
      .replace(" ", "\u00a0")
      .replace(/-/g, "\u2011")
  );
};

// A confirmed permission loss or removed record must not retain private snapshots.
export const invalidatesPrivateData = (error: unknown) =>
  error instanceof APIError && [401, 403, 404].includes(error.status);
