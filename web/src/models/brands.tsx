import { useState } from "react";
import type { Model } from "../api";

export const brands = [
  ["openai", "OpenAI / GPT"],
  ["google", "Google"],
  ["gemini", "Gemini"],
  ["midjourney", "Midjourney"],
  ["flux", "Flux (BFL)"],
  ["stability", "Stability"],
  ["kling", "可灵 Kling"],
  ["jimeng", "即梦"],
  ["doubao", "豆包"],
  ["bytedance", "字节 Seed"],
  ["volcengine", "火山引擎"],
  ["qwen", "通义千问"],
  ["hunyuan", "混元"],
  ["kolors", "可图 Kolors"],
  ["minimax", "MiniMax / 海螺"],
  ["suno", "Suno"],
  ["vidu", "Vidu"],
  ["runway", "Runway"],
  ["luma", "Luma"],
  ["pika", "Pika"],
  ["ideogram", "Ideogram"],
  ["recraft", "Recraft"],
  ["deepseek", "DeepSeek"],
  ["claude", "Claude"],
  ["anthropic", "Anthropic"],
  ["grok", "Grok"],
];
export const brandURL = (slug: string) => `/media/model-icons/${slug}.png`;
export function iconFor(m: Model) {
  if (m.settings?.icon) return m.settings.icon;
  const name = m.key + " " + m.name;
  const special: [[RegExp, string], ...[RegExp, string][]] = [
    [/seedream|jimeng|即梦/i, "jimeng"],
    [/seedance|bytedance|字节/i, "bytedance"],
    [/nano.banana|imagen|veo/i, "google"],
    [/gpt|sora|openai/i, "openai"],
    [/wan|qwen|通义/i, "qwen"],
  ];
  return brandURL(
    special.find(([r]) => r.test(name))?.[1] ||
      brands.find(([key]) => name.toLowerCase().includes(key))?.[0] ||
      "",
  );
}
export function ModelIcon({ model }: { model: Model }) {
  const icon = iconFor(model),
    [failed, setFailed] = useState("");
  if (icon && !icon.endsWith("/.png") && failed !== icon) {
    if (icon.startsWith("/") || icon.startsWith("https://"))
      return (
        <img
          className="model-brand-image"
          src={icon}
          alt=""
          onError={() => setFailed(icon)}
        />
      );
    return <span>{icon}</span>;
  }
  return <span>{Array.from(model.name)[0]}</span>;
}
