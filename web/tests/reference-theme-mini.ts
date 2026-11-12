import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppWindow, AudioLines, ChevronRight, Image, MessageCircle, Plus, Scissors, User, Video, X } from "lucide-react";

// Source-style projection only; native TDesign and WeChat chrome are not emulated.
export const source = (file: string) => readFileSync(path.resolve("../miniprogram", file), "utf8");
export const image = (file: string) => `data:image/png;base64,${readFileSync(path.resolve("../media", file)).toString("base64")}`;
const icons = { image: Image, "video-camera": Video, sound: AudioLines, "chevron-right": ChevronRight, close: X };
export const glyph = (name: keyof typeof icons, size = 20) => renderToStaticMarkup(createElement(icons[name], { size, strokeWidth: 1.75 }));
function css(file: string, width: number): string {
  return source(file)
    .replace(/@import "([^"]+)";/g, (_, next) => css(path.join(path.dirname(file), next), width))
    .replace(/^page\s*{/gm, "body {")
    .replace(/(?<![\w.-])view\b/g, "div")
    .replace(/(?<![\w.-])image\b/g, "img")
    .replace(/(?<![\w.-])text\b(?=\s*[,>{:])/g, "span")
    .replace(/([\d.]+)rpx/g, (_, n) => `${Number(n) * width / 750}px`);
}
export function styles(width: number, files: string[]) {
  return `<style>body{margin:0}button,input,textarea{font:inherit}input,textarea{background:transparent;border:0;outline:0}button{border:0}svg{flex-shrink:0}scroll-view{display:block;overflow:auto}img{object-fit:contain}${["styles/theme.wxss", "styles/common.wxss", "components/nav-bar/index.wxss", ...files].map(f => css(f,width)).join("\n")}</style>`;
}
export const header = (title: string) => `<div class="nav"><div class="nav-inner" style="height:76px;font-size:23px">${title}</div></div>`;
export function tabs() {
  return `<div class="tabbar">${[AppWindow, Scissors, Plus, MessageCircle, User].map((Icon, i) => `<div class="item ${i === 2 ? "active primary" : ""}"><div class="glyph">${renderToStaticMarkup(createElement(Icon,{size:24,strokeWidth:1.75}))}</div><span class="label">${["模板","混剪","创作","Agent","我的"][i]}</span></div>`).join("")}</div>`;
}
export function creator() {
  return `${header("创作")}<div class="page create-page">
    <div class="mode-tabs"><div class="mode-tab active">生成视频</div><div class="mode-tab">生成图片</div></div>
    <div class="workspace">
      <div class="reference-strip"><div class="reference-items"><div class="add-reference">＋</div></div></div>
      <div class="expand-editor">↗</div>
      <textarea class="prompt-input" placeholder="描述主体、动作和镜头，&#10;也可以先添加参考素材。"></textarea>
      <span class="count">0 / 500</span><div class="editor-meta"><div class="editor-balance"><div class="inline-balance">可用 9994 积分</div></div><div class="quote-note">预计 10 积分</div></div>
      <div class="workspace-foot"><div class="model-select"><img class="model-logo" src="${image("model-icons/bytedance.png")}" alt=""/><div class="model-copy"><span class="model-name">Seedance 2.0 Fast VIP</span><span class="spec">720p · 4秒</span></div><span>⌄</span></div><button class="generate-button">生成</button></div>
    </div>
    <div class="creation-hint"><span>输入 @ 可引用已上传的图片</span></div>
    <div class="settings"><span class="setting-title first-setting">分辨率</span><div class="resolution-options"><div class="resolution-option selected">720p</div><div class="resolution-option">1080p</div></div>
    <span class="setting-title">视频时长 · 4 秒</span><input type="range" value="0" aria-label="视频时长" style="width:100%;accent-color:var(--ui-brand)"/><div class="duration-limits"><span>4 秒</span><span>15 秒</span></div>
    <span class="setting-title">选择画幅</span><div class="ratio-grid">${["16:9","9:16","1:1","4:3","3:4"].map((s,i)=>`<div class="ratio ${i===0?"selected":""}"><div class="ratio-visual"><div class="ratio-shape ${["shape-wide","shape-portrait","shape-square","shape-landscape","shape-photo"][i]}"></div></div><span class="ratio-label">${s}</span></div>`).join("")}</div></div>
  </div>${tabs()}`;
}
export function materialSheet() {
  const wxml = source("pages/create/index.wxml"), start = wxml.indexOf('<view wx:if="{{allowImage}}"');
  return wxml.slice(start,wxml.indexOf("\n  </view>\n</t-popup>",start))
    .replace(/<t-icon\b[^>]*name="([\w-]+)"[^>]*size="(\d+)"[^>]*\/>/g,(_,name,size)=>glyph(name,Number(size)))
    .replace(/{{[^}]+}}/g, "")
    .replace(/<(\/?)(view|text)\b/g,(_,close,tag)=>`<${close}${tag==="view"?"div":"span"}`);
}
