import { request } from "./request";
import { RequestError } from "./errors";
import type { Row, Asset } from "./types";

// Agent 创作项目: a skill, its materials, and the jobs carrying its id.
export interface Skill { id: string; name: string; hint: string; icon: string; kind: string; starter: string; examples?: string[]; followUps?: string[] }
export interface Session { title: string; skill: string; assets: string[]; activeAt: string }
export type SessionRow = { id: string; version: number; data: Session };
export type SessionDetail = SessionRow & { assets: Row<Asset>[] };

let skillCache: Skill[] | undefined;
export async function skills(): Promise<Skill[]> {
  // Public: listing what can be made must not ask a signed-out user to log in.
  if (!skillCache) skillCache = await request<Skill[]>("/agent/skills", "GET", undefined, undefined, false);
  return skillCache;
}
export const sessions = () => request<SessionRow[]>("/agent/sessions");
export const createSession = (skill: string) => request<SessionRow>("/agent/sessions", "POST", { skill });
export const sessionDetail = (id: string) => request<SessionDetail>("/agent/sessions/" + id);
// Each message moves the project's version on the server (its activeAt), so
// the page's copy is often one behind: on a version conflict, read the
// project and apply the same change once more (it is the user's own edit).
export async function updateSession(id: string, version: number, patch: { assets?: string[]; title?: string; deleted?: boolean }): Promise<SessionRow> {
  const put = (v: number) => request<SessionRow>("/agent/sessions/" + id, "PUT", { version: v, ...patch });
  try {
    return await put(version);
  } catch (e) {
    if (!(e instanceof RequestError) || e.status !== 409) throw e;
    return put((await sessionDetail(id)).version);
  }
}
