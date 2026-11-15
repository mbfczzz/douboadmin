import { useEffect, useRef, useState } from "react";
import type { ModelSettings } from "./types";
import {
  fillPerSecond,
  inferPerSecond,
  perSecondError,
} from "./per-second-pricing";
import "./per-second.css";

export default function PerSecondFill({
  resolution,
  durations,
  matrix,
  onChange,
}: {
  resolution: string;
  durations: number[];
  matrix: ModelSettings["priceMatrix"];
  onChange: (matrix: NonNullable<ModelSettings["priceMatrix"]>) => void;
}) {
  const signatureOf = (prices: ModelSettings["priceMatrix"]) =>
    JSON.stringify(durations.map((d) => [d, prices?.[`${d}s`]?.[resolution]]));
  const signature = signatureOf(matrix);
  const inferred = inferPerSecond(matrix, resolution, durations);
  const [draft, setDraft] = useState({
    signature,
    value: inferred,
    filled: false,
  });
  const current =
    draft.signature === signature
      ? draft
      : { signature, value: inferred, filled: false };
  const { value, filled } = current;
  const input = useRef<HTMLInputElement>(null);
  const error = perSecondError(value, durations);
  const pending =
    !!value.trim() &&
    !error &&
    (inferred === "" || Number(value) !== Number(inferred));
  useEffect(() => {
    setDraft((previous) =>
      previous.signature === signature
        ? previous
        : { signature, value: inferred, filled: false },
    );
  }, [signature, inferred]);
  useEffect(() => {
    input.current?.setCustomValidity(
      error || (pending ? "请先点击填充本列，或清空每秒积分输入" : ""),
    );
  }, [error, pending]);
  return (
    <div className="per-second-fill">
      <input
        ref={input}
        aria-label={`${resolution.toUpperCase()} 每秒积分`}
        type="number"
        min={0}
        max={1e9}
        step="0.01"
        placeholder="积分 / 秒"
        value={value}
        aria-invalid={!!error || pending}
        onChange={(e) => {
          setDraft({ signature, value: e.target.value, filled: false });
        }}
      />
      <button
        type="button"
        className="secondary"
        disabled={!value.trim() || !!error}
        aria-label={`填充 ${resolution.toUpperCase()} 全部时长`}
        onClick={() => {
          const next = fillPerSecond(matrix, resolution, durations, value);
          setDraft({ signature: signatureOf(next), value, filled: true });
          onChange(next);
        }}
      >
        填充本列
      </button>
      {error ? (
        <small className="per-second-error" role="alert">
          {error}
        </small>
      ) : pending ? (
        <small role="status">尚未填充，请点击填充本列</small>
      ) : (
        filled && (
          <small role="status">已填充 {durations.length} 项，保存后生效</small>
        )
      )}
    </div>
  );
}
