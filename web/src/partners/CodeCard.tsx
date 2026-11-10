import type { ReactNode } from "react";
import { Copy, Download, RotateCcw } from "lucide-react";
import { api } from "../api";
import type { useShareCode } from "./useShareCode";
import RequestState from "../components/RequestState";
import { ask } from "../confirm/ask";
import { copyText } from "../clipboard";
import type { Notify } from "../navigation";
import type { BoundUser } from "./types";

export type { BoundUser, Share } from "./types";
const pretty = (code: string) => code.slice(0, 4) + "-" + code.slice(4);

// One long-lived QR code: the QR, its code and what to do with it.
// `bound` replaces the code once a bind code has linked an account.
export default function CodeView({
  path,
  title,
  note,
  file,
  notify,
  bound,
  share,
}: {
  path: string;
  title: string;
  note: string;
  file: string;
  notify: Notify;
  share: ReturnType<typeof useShareCode>;
  bound?: (
    user: BoundUser,
    pending: boolean,
    reload: () => Promise<void>,
  ) => ReactNode;
}) {
  const s = share.data;
  async function reset() {
    const ok = await ask({
      title: `重置${title}？`,
      message:
        "旧二维码会立即失效，已发出或打印的需要换新；已登记的会员和服务商不受影响。",
      confirmText: "重置",
      danger: true,
      run: () => api(path, { method: "POST", body: "{}", confirmation: false }),
    });
    if (ok === false) return;
    await share.reload();
    notify(`${title}已重置`);
  }
  async function copy() {
    try {
      await copyText(s!.code);
      notify("已复制");
    } catch {
      notify("复制失败，请手动选择");
    }
  }
  if (s?.user) return bound?.(s.user, !!s.pending, share.reload);
  return (
    <div className="code-view" aria-busy={share.loading}>
      <div className="share-qr-slot">
        {s ? (
          <img
            className="share-qr"
            src={s.qr}
            alt={title + "二维码"}
            width="168"
            height="168"
          />
        ) : (
          <div className="share-qr-placeholder">
            <RequestState
              loading={share.loading}
              error={share.error}
              retry={share.reload}
            />
          </div>
        )}
      </div>
      <div className="code-info">
        <p className="share-code mono">
          {s ? (
            pretty(s.code)
          ) : (
            <span className="share-code-placeholder" aria-hidden="true" />
          )}
        </p>
        <p className="quiet">{note}</p>
        <div className="share-actions">
          <a
            className="primary"
            href={s?.qr}
            download={s ? file : undefined}
            aria-disabled={!s || undefined}
            tabIndex={s ? undefined : -1}
          >
            <Download size={15} aria-hidden="true" />
            下载二维码
          </a>
          <button
            type="button"
            className="secondary"
            onClick={copy}
            disabled={!s}
          >
            <Copy size={15} aria-hidden="true" />
            复制
          </button>
          <button
            type="button"
            className="text-button danger-text"
            disabled={!s}
            onClick={() => void reset()}
          >
            <RotateCcw size={14} aria-hidden="true" />
            重置
          </button>
        </div>
      </div>
    </div>
  );
}
