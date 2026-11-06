import { Check, Copy } from "lucide-react";
import { useState } from "react";

export default function ProviderId({ id }: { id: string }) {
  const [result, setResult] = useState("");
  const shortId = id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
  return (
    <>
      <button
        type="button"
        className="text-button provider-id"
        title={id}
        aria-label={`复制服务商编号 ${id}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(id);
            setResult("已复制");
          } catch {
            setResult(`复制失败，请手动复制：${id}`);
          }
        }}
      >
        <span>{shortId}</span>
        {result === "已复制" ? (
          <Check size={12} aria-hidden="true" />
        ) : (
          <Copy size={12} aria-hidden="true" />
        )}
      </button>
      {result && <span role="status">{result}</span>}
    </>
  );
}
