const CONTEXTS = {
  default: {
    heading: "你的创作空间",
    description: "保存作品、收藏灵感，下次回来接着创作。",
    backLabel: "先逛逛",
  },
  generate: {
    heading: "登录后继续生成",
    description: "你的输入和素材已保留，登录后会继续刚才的操作。",
    backLabel: "返回继续编辑",
  },
  upload: {
    heading: "登录后继续上传",
    description: "已选素材还在，登录后继续添加到这次创作。",
    backLabel: "暂不上传",
  },
  favorite: {
    heading: "登录后收藏模板",
    description: "把喜欢的模板存起来，想做的时候随时找到。",
    backLabel: "暂不收藏",
  },
  tasks: {
    heading: "登录后查看任务",
    description: "查看生成进度，继续处理未完成的作品。",
    backLabel: "暂不登录",
  },
  works: {
    heading: "登录后查看作品",
    description: "完成的图片和视频，都会保存在你的作品里。",
    backLabel: "暂不登录",
  },
  profile: {
    heading: "登录后完善资料",
    description: "已选头像已保留，登录后继续保存。",
    backLabel: "返回个人页",
  },
  feedback: {
    heading: "登录后提交反馈",
    description: "填写的内容已保留，登录后继续提交。",
    backLabel: "返回继续填写",
  },
  chat: {
    heading: "登录后继续对话",
    description: "你的消息已保留，登录后继续发送。",
    backLabel: "返回对话",
  },
};

export type LoginPurpose = keyof typeof CONTEXTS;

export function loginContext(purpose?: string) {
  return purpose && Object.prototype.hasOwnProperty.call(CONTEXTS, purpose)
    ? CONTEXTS[purpose as LoginPurpose]
    : CONTEXTS.default;
}

export function requestPurpose(
  path: string,
  method: string,
  data?: unknown,
): LoginPurpose {
  if ((path === "/jobs" || path === "/jobs/quote") && method === "POST")
    return (data as { kind?: string })?.kind === "chat" ? "chat" : "generate";
  if (path.startsWith("/favorites")) return "favorite";
  if (path === "/feedback") return "feedback";
  return "default";
}
