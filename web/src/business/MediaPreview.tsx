import type { Job } from "../api";
export default function MediaPreview({ job }: { job: Job }) {
  return (
    <div className="business-preview">
      {job.result ? (
        job.input.kind === "image" ? (
          <img src={job.result} alt="作品预览" />
        ) : (
          <video src={job.result} controls preload="metadata" />
        )
      ) : (
        <p>作品暂无可用预览</p>
      )}
      <p>{job.input.prompt}</p>
    </div>
  );
}
