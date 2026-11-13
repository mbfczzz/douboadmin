import { useEffect, useState } from "react";
import {
  drawInvitePoster,
  POSTER_HEIGHT,
  POSTER_WIDTH,
} from "../../../miniprogram/utils/invite-poster";

export function useCodePoster(
  path: string,
  qr: string | undefined,
  code: string,
  title: string,
  owner: string,
  revision?: object,
) {
  const [state, setState] = useState({ url: "", error: "" });
  useEffect(() => {
    setState({ url: "", error: "" });
    if (!qr) return;
    const controller = new AbortController();
    let source = "",
      output = "";
    async function render() {
      try {
        const response = await fetch(
          `/api${path}?image=1&code=${encodeURIComponent(code)}`,
          { signal: controller.signal, credentials: "include" },
        );
        if (
          !response.ok ||
          !response.headers.get("content-type")?.startsWith("image/png")
        )
          throw new Error("分享卡片生成失败，请刷新重试");
        source = URL.createObjectURL(await response.blob());
        const image = new Image();
        image.src = source;
        await image.decode();
        if (controller.signal.aborted) return;
        const canvas = document.createElement("canvas");
        canvas.width = POSTER_WIDTH;
        canvas.height = POSTER_HEIGHT;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("当前浏览器无法生成卡片");
        drawInvitePoster(context, image, { code, title, owner });
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("卡片导出失败"))),
            "image/png",
          ),
        );
        if (controller.signal.aborted) return;
        output = URL.createObjectURL(blob);
        setState({ url: output, error: "" });
      } catch (e) {
        if (!controller.signal.aborted)
          setState({ url: "", error: (e as Error).message });
      } finally {
        if (source) URL.revokeObjectURL(source);
      }
    }
    void render();
    return () => {
      controller.abort();
      if (source) URL.revokeObjectURL(source);
      if (output) URL.revokeObjectURL(output);
    };
  }, [path, qr, code, title, owner, revision]);
  return state;
}
