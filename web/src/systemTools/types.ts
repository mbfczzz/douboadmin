export interface ToolCheck {
  status: "ready" | "missing" | "failed" | "timeout";
  version?: string;
  path?: string;
  error?: string;
}

export interface MediaTools {
  ffmpeg: ToolCheck;
  ffprobe: ToolCheck;
  checkedAt: string;
}
