import { useEffect, useRef, useState } from "react";
import { Image, Bot, Film, Music } from "lucide-react";
import type { Job } from "../api";
import { mediaURL, cachedCover } from "./thumbnail-sources";
import { useThumbnailRetry } from "./useThumbnailRetry";
import "./job-thumbnail.css";

export default function JobThumbnail({ job, refreshKey = 0 }: { job: Job; refreshKey?: number }) {
  const box = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const retry = useThumbnailRetry(job.userId, job.id, visible);
  const reset = retry.reset;
  useEffect(reset, [refreshKey, reset]);
  useEffect(() => {
    if (!box.current) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px" },
    );
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);
  const kind = job.input.kind,
    video = kind === "video" || kind === "mix";
  const ready = job.status === "succeeded" && !job.deleted;
  const result = ready ? mediaURL(job.result) : "";
  const poster = ready
    ? cachedCover(job.userId, job.id, mediaURL(job.thumbnailUrl))
    : "";
  const image = [poster, kind === "image" ? result : ""].find(
    (url) => url && retry.allowed(url),
  );
  const clip = video && result ? result.split("#")[0] + "#t=0.1" : "";
  const Icon =
    kind === "image"
      ? Image
      : kind === "chat"
        ? Bot
        : kind === "audio"
          ? Music
          : Film;
  return (
    <span ref={box} className="task-icon job-thumbnail">
      {image ? (
        <img
          src={image}
          alt={video ? "视频封面" : "生成图片缩略图"}
          loading="lazy"
          decoding="async"
          onLoad={() => retry.loaded(image, image === poster)}
          onError={() => retry.failed(image)}
        />
      ) : visible && clip && retry.allowed(clip) ? (
        <video
          src={clip}
          muted
          playsInline
          preload="metadata"
          aria-label="视频封面"
          onLoadedData={() => retry.loaded(clip)}
          onError={() => retry.failed(clip)}
        />
      ) : (
        <Icon size={18} aria-hidden="true" />
      )}
    </span>
  );
}
