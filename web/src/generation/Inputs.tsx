import { ExternalLink, FileText, Image, Music, Video } from "lucide-react";
import type { GenInput } from "./types";

const groups = [
  ["image", "图片", Image],
  ["video", "参考视频", Video],
  ["audio", "参考音频", Music],
  ["file", "其他文件", FileText],
] as const;

const size = (n: number) =>
  n >= 1 << 20
    ? `${(n / (1 << 20)).toFixed(1)} MB`
    : `${Math.ceil(n / 1024)} KB`;

// Every material the user sent, grouped by type and numbered as in the prompt.
export default function Inputs({ inputs }: { inputs: GenInput[] }) {
  if (!inputs.length)
    return <p className="quiet">本次生成没有上传素材（纯文本提示词）。</p>;
  return (
    <div className="gen-inputs">
      {groups.map(([kind, title, Icon]) => {
        const items = inputs.filter((i) => i.kind === kind);
        if (!items.length) return null;
        return (
          <section key={kind} aria-label={title}>
            <h5>
              <Icon size={14} aria-hidden="true" />
              {title}
              <span className="gen-count">{items.length}</span>
            </h5>
            <div className={"gen-media " + kind}>
              {items.map((i) => (
                <figure key={i.id}>
                  {!i.url ? (
                    <div className="gen-missing">素材已失效</div>
                  ) : kind === "image" ? (
                    <a href={i.url} target="_blank" rel="noreferrer">
                      <img src={i.url} alt={i.label} loading="lazy" />
                    </a>
                  ) : kind === "video" ? (
                    <video src={i.url} controls preload="metadata" />
                  ) : kind === "audio" ? (
                    <audio src={i.url} controls preload="metadata" />
                  ) : null}
                  <figcaption>
                    <b>{i.label}</b>
                    <span className="quiet" title={i.mime}>
                      {(i.mime.split("/")[1] || "未知格式").toUpperCase()}
                      {i.size ? " · " + size(i.size) : ""}
                    </span>
                    {i.url && (
                      <a
                        href={i.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`打开${i.label}`}
                      >
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
