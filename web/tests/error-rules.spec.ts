import { test, expect } from "@playwright/test";
import { confirmSubmission, login } from "./helpers";
import { surfaceFixtures } from "./surface-fixtures";

const cause =
  "查询上游任务失败：中转服务 HTTP 502（业务码 5001，task_failed）：video_generation_failed: 本次生成失败：第1个视频素材：画面帧率 120fps 超出范围";

// 错误归档: a failed generation shows what its user reads and files the
// upstream failure; 日志管理 lists, edits and deletes the filed rules.
test("an administrator files a failure and manages the rules", async ({
  page,
}) => {
  await login(page);
  await surfaceFixtures(page);
  let rules: unknown[] = [];
  const writes: { method: string; body: unknown }[] = [];
  await page.route("**/api/admin/jobs/qa-job/detail", (route) =>
    route.fulfill({
      json: {
        job: {
          id: "qa-job",
          userId: "qa-user",
          status: "failed",
          progress: 100,
          input: { kind: "video", model: "m", prompt: "x", assets: [] },
          error: "生成失败，请查看生成记录或联系管理员。",
          createdAt: "2026-11-27T05:49:41Z",
        },
        inputs: [],
        execution: {
          phase: "failed",
          errorCause: cause,
          startedAt: "2026-11-27T05:49:41Z",
        },
        calls: [],
        polls: 0,
        morePolls: false,
        publicError: { message: "系统异常，生成失败，请稍后重试", action: "" },
      },
    }),
  );
  await page.route("**/api/admin/error-rules**", (route) => {
    const r = route.request();
    if (r.method() === "GET") return route.fulfill({ json: rules });
    writes.push({ method: r.method(), body: r.postDataJSON() });
    return route.fulfill({ json: { id: "rule-1", version: 1, data: {} } });
  });
  await page.getByRole("button", { name: "生成任务", exact: true }).click();
  await page
    .locator("tbody tr")
    .first()
    .getByRole("button", { name: /详情/ })
    .click();
  const detail = page.getByRole("dialog", { name: "生成记录详情" });
  const failure = detail.getByRole("region", { name: "失败原因" });
  await expect(failure).toContainText(
    "用户看到：系统异常，生成失败，请稍后重试",
  );
  await failure.getByRole("button", { name: "归档此错误" }).click();
  const dialog = page.getByRole("dialog", { name: "归档此错误" });
  await expect(dialog).toContainText("上游原文（仅管理员可见）");
  const match = dialog.getByLabel("匹配内容");
  await expect(match).not.toHaveValue("");
  await match.fill("画面帧率");
  await dialog.getByLabel("用户看到的提示").fill("参考视频帧率过高");
  await dialog
    .getByLabel("建议操作（可选）")
    .fill("请换用 24–60 帧的视频后重试。");
  await dialog.getByRole("button", { name: "保存归档" }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toEqual([
    {
      method: "POST",
      body: {
        data: {
          contains: "画面帧率",
          message: "参考视频帧率过高",
          action: "请换用 24–60 帧的视频后重试。",
        },
      },
    },
  ]);
  await detail.getByRole("button", { name: "关闭", exact: true }).click();

  rules = [
    {
      id: "rule-1",
      version: 1,
      createdAt: "2026-11-27T06:00:00Z",
      data: {
        contains: "画面帧率",
        message: "参考视频帧率过高",
        action: "请换用 24–60 帧的视频后重试。",
      },
    },
  ];
  await page.getByRole("button", { name: "日志管理", exact: true }).click();
  await page.getByRole("tab", { name: "错误归档" }).click();
  const row = page.locator("tbody tr").filter({ hasText: "画面帧率" });
  await expect(row).toContainText("参考视频帧率过高");
  await row.getByRole("button", { name: "编辑" }).click();
  const edit = page.getByRole("dialog", { name: "编辑错误归档" });
  await edit.getByLabel("用户看到的提示").fill("参考视频帧率超出模型范围");
  await edit.getByRole("button", { name: "保存归档" }).click();
  await confirmSubmission(page);
  await expect(edit).toHaveCount(0);
  expect(writes.at(-1)).toEqual({
    method: "PUT",
    body: {
      version: 1,
      data: {
        contains: "画面帧率",
        message: "参考视频帧率超出模型范围",
        action: "请换用 24–60 帧的视频后重试。",
      },
    },
  });
  await row.getByRole("button", { name: "删除" }).click();
  await page
    .getByRole("dialog", { name: "删除错误归档" })
    .getByRole("button", { name: "删除", exact: true })
    .click();
  await expect
    .poll(() => writes.at(-1))
    .toEqual({ method: "DELETE", body: { version: 1 } });
});
