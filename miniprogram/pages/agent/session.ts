import { error, hasSession } from "../../utils/api";
import { sessionUserId } from "../../services/session";
import { ask } from "../../services/dialog";
import { skills, sessions, createSession, sessionDetail, updateSession } from "../../services/agent";
import type { Skill, SessionRow, SessionDetail } from "../../services/agent";
import type { ChatMessage } from "../../services/types";
import { editorAsset } from "../../utils/editor-assets";
import { materialData } from "./materials";
import { date } from "../../utils/ui";

// The Agent's 创作项目: which one is open (remembered per account), the
// project sheet, starting one from a skill, and deleting one.
const KEY = "agent-session";
const remembered = () => (wx.getStorageSync(KEY) as { user?: string; id?: string }) || {};
const remember = (id: string) => wx.setStorageSync(KEY, { user: sessionUserId(), id });

// A row in the project sheet: its skill (for the picture and name) and when it was last used.
export type ProjectView = SessionRow & { skillName: string; when: string };
export const projectView = (row: SessionRow, skills: Skill[]): ProjectView => ({
  ...row,
  skillName: skills.find((s) => s.id === row.data.skill)?.name || "创作",
  when: row.data.activeAt ? date(row.data.activeAt) : "",
});

const FOLLOW_UPS = ["缩短到 10 秒", "换一个开场", "改成横屏"];
// What an open project suggests: first messages when empty, quick revisions after.
const skillHints = (skills: Skill[], id?: string) => {
  const skill = skills.find((s) => s.id === id);
  return { examples: skill?.examples || [], followUps: skill?.followUps?.length ? skill.followUps : FOLLOW_UPS };
};

type Page = {
  data: { session: SessionDetail | null; skills: Skill[]; projects: ProjectView[]; projectsOpen: boolean; prompt: string; materials: ReturnType<typeof editorAsset>[]; messages: ChatMessage[] };
  destroyed: boolean;
  setData(data: Record<string, unknown>): void;
  load(force?: boolean): Promise<void>;
  showSession(id: string): Promise<void>;
  titling?: boolean;
};

export const sessionHandlers = {
  // The open project (or none: the skill picker), with its materials signed.
  async loadSession(this: Page) {
    if (!hasSession()) return this.setData({ session: null });
    const [list, all] = await Promise.all([sessions(), skills()]);
    if (this.destroyed) return;
    const saved = remembered();
    // "new": the user went back to the skill picker and stays there.
    const mine = saved.user === sessionUserId();
    const id = mine && saved.id === "new" ? "" : mine && list.some((s) => s.id === saved.id) ? saved.id! : list[0]?.id;
    this.setData({ projects: list.map((row) => projectView(row, all)), skills: all });
    await this.showSession(id || "");
  },
  async showSession(this: Page, id: string) {
    if (!id) return this.setData({ session: null, materials: [], thumbs: {}, ...skillHints([]) });
    const detail = await sessionDetail(id);
    if (this.destroyed) return;
    remember(id);
    // Re-signed links for the same files would reload every picture on each visit.
    const shown = new Map(this.data.materials.map((m) => [m.id, m]));
    this.setData({ session: detail, ...skillHints(this.data.skills, detail.data.skill), ...materialData(detail.assets.map((a) => shown.get(a.id) || editorAsset(a))) });
  },
  // 新建: back to the skill picker; the current project stays in the list.
  async startOver(this: Page) {
    remember("new");
    await this.showSession("");
    this.setData({ messages: [], prompt: "", projectsOpen: false });
    await this.load(true);
  },
  openProjects(this: Page) {
    this.setData({ projectsOpen: true });
    void sessions()
      .then((list) => !this.destroyed && this.setData({ projects: list.map((row) => projectView(row, this.data.skills)) }))
      .catch(() => undefined);
  },
  closeProjects(this: Page) {
    this.setData({ projectsOpen: false });
  },
  async switchProject(this: Page, e: WechatMiniprogram.TouchEvent) {
    this.setData({ projectsOpen: false });
    try {
      await this.showSession(e.currentTarget.dataset.id);
      await this.load(true);
    } catch (err) {
      error(err);
    }
  },
  // A skill starts a new project and fills the composer with its opener.
  async newProject(this: Page, e: WechatMiniprogram.TouchEvent) {
    const skill = this.data.skills.find((s) => s.id === e.currentTarget.dataset.id);
    if (!skill) return;
    this.setData({ projectsOpen: false });
    try {
      const row = await createSession(skill.id);
      if (this.destroyed) return;
      remember(row.id);
      this.setData({ session: { ...row, assets: [] }, materials: [], thumbs: {}, ...skillHints(this.data.skills, skill.id), prompt: skill.starter || this.data.prompt, focus: true });
      this.setData({ projects: [projectView(row, this.data.skills), ...this.data.projects] });
      await this.load(true);
    } catch (err) {
      error(err);
    }
  },
  // A project still named after its skill takes its first plan's title,
  // so the project sheet does not fill with identical names.
  async autoTitle(this: Page) {
    const s = this.data.session;
    const skill = this.data.skills.find((k) => k.id === s?.data.skill);
    const plan = this.data.messages.find((m) => m.plan)?.plan;
    if (!s || !plan || !skill || s.data.title !== skill.name || this.titling) return;
    this.titling = true;
    try {
      const row = await updateSession(s.id, s.version, { title: plan.title });
      if (this.destroyed || this.data.session?.id !== s.id) return;
      this.setData({ session: { ...this.data.session, version: row.version, data: row.data } });
      this.setData({ projects: this.data.projects.map((p) => (p.id === row.id ? projectView(row, this.data.skills) : p)) });
    } catch {
      // a rename race (version) is harmless: the next visit tries again
    } finally {
      this.titling = false;
    }
  },
  async removeProject(this: Page, e: WechatMiniprogram.TouchEvent) {
    const row = this.data.projects.find((p) => p.id === e.currentTarget.dataset.id);
    if (!row) return;
    const ok = await ask({ title: "删除这个项目？", content: "对话和素材从项目列表移除；已生成的作品、积分记录不受影响。", confirmText: "删除", tone: "danger", icon: "delete" });
    if (!ok || this.destroyed) return;
    try {
      await updateSession(row.id, row.version, { deleted: true });
      const projects = this.data.projects.filter((p) => p.id !== row.id);
      this.setData({ projects });
      if (this.data.session?.id === row.id) {
        await this.showSession(projects[0]?.id || "");
        await this.load(true);
      }
    } catch (err) {
      error(err);
    }
  },
};
