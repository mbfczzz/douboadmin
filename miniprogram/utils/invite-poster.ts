export interface InvitePoster {
  title: string;
  owner?: string;
  code: string;
}
export const POSTER_WIDTH = 720;
export const POSTER_HEIGHT = 1060;
// Canvas 2D subset shared by the browser and WeChat; no DOM or platform imports.
export interface PosterContext {
  fillStyle: unknown;
  font: string;
  textAlign: string;
  textBaseline: string;
  imageSmoothingEnabled: boolean;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  drawImage(image: any, x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  closePath(): void;
  fill(): void;
}
function box(
  c: PosterContext,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
) {
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
  c.fill();
}
function text(
  c: PosterContext,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string,
  bold = false,
) {
  c.font = `${bold ? "600 " : ""}${size}px sans-serif`;
  c.fillStyle = color;
  c.fillText(value, x, y);
}
function ownerLines(c: PosterContext, owner: string) {
  c.font = "28px sans-serif";
  const lines: string[] = [];
  let line = "";
  for (const char of Array.from(owner)) {
    if (c.measureText(line + char).width > 610) {
      lines.push(line);
      line = "";
    }
    line += char;
  }
  if (line) lines.push(line);
  return lines.length > 2 ? [lines[0], lines[1].slice(0, -1) + "…"] : lines;
}
export function drawInvitePoster(
  c: PosterContext,
  image: any,
  data: InvitePoster,
) {
  c.textBaseline = "top";
  c.textAlign = "left";
  c.fillStyle = "#111317";
  c.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  box(c, 48, 52, 8, 34, 4, "#00c8dc");
  text(c, "豆播 AI", 72, 48, 34, "#f4f5f7", true);
  c.textAlign = "right";
  text(c, data.title, 672, 58, 21, "#a6abb5");
  c.textAlign = "left";
  ownerLines(c, data.owner || "豆播 AI · 创作邀请").forEach((line, i) =>
    text(c, line, 48, 130 + i * 38, 28, "#f4f5f7", true),
  );
  box(c, 48, 236, 624, 654, 24, "#ffffff");
  // Keep the complete original code and at least 48 px of white quiet zone.
  c.imageSmoothingEnabled = false;
  c.drawImage(image, 145, 280, 430, 430);
  c.textAlign = "center";
  text(c, "邀请码", 360, 742, 20, "#667085");
  text(
    c,
    data.code.slice(0, 4) + "-" + data.code.slice(4),
    360,
    778,
    36,
    "#202632",
    true,
  );
  text(c, "识别后自动带入邀请码", 360, 842, 21, "#667085");
  box(c, 48, 922, 624, 64, 16, "#00c8dc");
  text(c, "微信扫码进入豆播 AI", 360, 939, 26, "#082b30", true);
  text(c, "完成登记后，由超级管理员开通", 360, 1010, 20, "#a6abb5");
}
