import { error, hasSession } from "../../utils/api";
import { sessionUserId } from "../../services/session";
import { ask } from "../../services/dialog";
import { skills, sessions, createSession, sessionDetail, updateSession } from "../../services/agent";
import type { Skill, SessionRow, SessionDetail } from "../../services/agent";
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

type Page = {
  data: { session: SessionDetail | null; skills: Skill[]; projects: ProjectView[]; projectsOpen: boolean; prompt: string; materials: ReturnType<typeof editorAsset>[] };
  destroyed: boolean;
  setData(data: Record<string, unknown>): void;
  load(force?: boolean): Promise<void>;
  showSession(id: string): Promise<void>;
};

export const sessionHandlers = {
  // The open project (or none: the skill picker), with its materials signed.
  async loadSession(this: Page) {
    if (!hasSession()) return this.setData({ session: null });
    const [list, all] = await Promise.all([sessions(), skills()]);
    if (this.destroyed) return;
    const saved = remembered();
    const id = saved.user === sessionUserId() && list.some((s) => s.id === saved.id) ? saved.id! : list[0]?.id;
    this.setData({ projects: list.map((row) => projectView(row, all)), skills: all });
    await this.showSession(id || "");
  },
  async showSession(this: Page, id: string) {
    if (!id) return this.setData({ session: null, materials: [], thumbs: {} });
    const detail = await sessionDetail(id);
    if (this.destroyed) return;
    remember(id);
    // Re-signed links for the same files would reload every picture on each visit.
    const shown = new Map(this.data.materials.map((m) => [m.id, m]));
    this.setData({ session: detail, ...materialData(detail.assets.map((a) => shown.get(a.id) || editorAsset(a))) });
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
      this.setData({ session: { ...row, assets: [] }, materials: [], thumbs: {}, prompt: skill.starter || this.data.prompt, focus: true });
      this.setData({ projects: [projectView(row, this.data.skills), ...this.data.projects] });
      await this.load(true);
    } catch (err) {
      error(err);
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
