import { API_BASE } from "../config";
import { sessionToken } from "./session";
import { utf8Pieces } from "../utils/utf8";

// A reply as it is written (GET /jobs/{id}/stream, server-sent events read
// in chunks). Returns null where chunked reading is unsupported; the caller
// then asks for the reply so far every half second instead.
export type StreamEvents = {
  text(whole: string): void; // the reply so far
  end(how: "done" | "again" | "failed"): void;
};

export function openReplyStream(id: string, on: StreamEvents): (() => void) | null {
  if (wx.canIUse && !wx.canIUse("request.object.enableChunked")) return null;
  const decode = utf8Pieces();
  let buffer = "";
  let whole = "";
  let ended = false;
  const end = (how: "done" | "again" | "failed") => {
    if (!ended) (ended = true), on.end(how);
  };
  const task = wx.request({
    url: API_BASE + "/api/jobs/" + id + "/stream",
    header: { Authorization: "Bearer " + sessionToken(), Accept: "text/event-stream" },
    enableChunked: true,
    responseType: "arraybuffer",
    timeout: 150000,
    // Closed without "done": read again. (Deferred past the support check below.)
    success: (res) => setTimeout(() => end(res.statusCode === 200 ? "again" : "failed")),
    fail: () => setTimeout(() => end("failed")),
  } as WechatMiniprogram.RequestOption);
  if (typeof task?.onChunkReceived !== "function") {
    ended = true;
    task?.abort?.();
    return null;
  }
  task.onChunkReceived((res) => {
    buffer += decode(res.data as ArrayBuffer);
    let cut = buffer.indexOf("\n\n");
    for (; cut >= 0; cut = buffer.indexOf("\n\n")) {
      const line = buffer.slice(0, cut).trim();
      buffer = buffer.slice(cut + 2);
      if (!line.startsWith("data:")) continue;
      let e: { text?: string; delta?: string; done?: boolean; again?: boolean };
      try {
        e = JSON.parse(line.slice(5));
      } catch {
        continue;
      }
      if (typeof e.text === "string") whole = e.text;
      if (typeof e.delta === "string") whole += e.delta;
      if (e.text !== undefined || e.delta !== undefined) on.text(whole);
      if (e.done) end("done");
      if (e.again) end("again");
    }
  });
  return () => {
    ended = true;
    task.abort();
  };
}
