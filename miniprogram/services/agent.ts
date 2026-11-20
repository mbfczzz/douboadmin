import { request } from "./request";
import type { Row, Asset } from "./types";

// Agent 创作项目: a skill, its materials, and the jobs carrying its id.
export interface Skill { id: string; name: string; hint: string; icon: string; kind: string; starter: string; examples?: string[]; followUps?: string[] }
export interface Session { title: string; skill: string; assets: string[]; activeAt: string }
export type SessionRow = { id: string; version: number; data: Session };
export type SessionDetail = SessionRow & { assets: Row<Asset>[] };

let skillCache: Skill[] | undefined;
export async function skills(): Promise<Skill[]> {
  if (!skillCache) skillCache = await request<Skill[]>("/agent/skills");
  return skillCache;
}
export const sessions = () => request<SessionRow[]>("/agent/sessions");
export const createSession = (skill: string) => request<SessionRow>("/agent/sessions", "POST", { skill });
export const sessionDetail = (id: string) => request<SessionDetail>("/agent/sessions/" + id);
export const updateSession = (id: string, version: number, patch: { assets?: string[]; title?: string; deleted?: boolean }) =>
  request<SessionRow>("/agent/sessions/" + id, "PUT", { version, ...patch });
