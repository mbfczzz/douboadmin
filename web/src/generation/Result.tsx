import type { Job } from "../api";
import { resultKind } from "./types";

// The output, shown in the form it was generated in.
export default function Result({ job }: { job: Job }) {
  if (!job.result) {
    const text =
      job.status === "failed"
        ? "生成失败，没有结果"
        : job.status === "succeeded"
          ? "结果文件已失效"
          : `生成中 · ${job.progress || 0}%`;
    return <p className="gen-empty quiet">{text}</p>;
  }
  const kind = resultKind(job);
  return (
    <div className={"gen-result " + kind}>
      {kind === "text" ? (
        <pre>{job.result}</pre>
      ) : kind === "image" ? (
        <a href={job.result} target="_blank" rel="noreferrer">
          <img src={job.result} alt="生成结果" />
        </a>
      ) : kind === "audio" ? (
        <audio src={job.result} controls />
      ) : (
        <video src={job.result} controls preload="metadata" />
      )}
      {kind !== "text" && (
        <a
          className="gen-open"
          href={job.result}
          target="_blank"
          rel="noreferrer"
        >
          在新窗口打开
        </a>
      )}
    </div>
  );
}
