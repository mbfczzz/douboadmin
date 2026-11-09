import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import { surfaceFixtures } from "./surface-fixtures";

test("generation detail shows prompt, materials, parameters, error and model calls", async ({
  page,
}) => {
  await login(page);
  await surfaceFixtures(page);
  await page.route("**/api/admin/jobs/qa-job/detail", (route) =>
    route.fulfill({
      json: {
        job: {
          id: "qa-job",
          userId: "qa-user",
          status: "failed",
          progress: 100,
          attempts: 2,
          retryable: false,
          demo: false,
          modelName: "质检视频模型",
          costUnits: 11000,
          billingState: "released",
          input: {
            kind: "video",
            model: "qa-video",
            prompt: "图片1的人在视频1的沙漠里跳舞，配音频1",
            mode: "multi_ref",
            resolution: "720p",
            ratio: "16:9",
            duration: 30,
            assets: ["a", "v", "s"],
          },
          error: "内容审核未通过",
          createdAt: "2026-11-09T00:37:19Z",
          updatedAt: "2026-11-09T00:53:29Z",
        },
        inputs: [
          {
            id: "a",
            kind: "image",
            mime: "image/jpeg",
            size: 2048,
            url: "/media/a.jpg",
            label: "图片 1",
          },
          {
            id: "v",
            kind: "video",
            mime: "video/mp4",
            size: 4096,
            url: "/media/v.mp4",
            label: "视频 1",
          },
          {
            id: "s",
            kind: "audio",
            mime: "audio/mpeg",
            size: 1024,
            url: "/media/s.mp3",
            label: "音频 1",
          },
        ],
        execution: {
          phase: "failed",
          taskId: "task-x",
          modelKey: "seedance-lite",
          errorCause: "content_policy_violation",
          startedAt: "2026-11-09T00:37:19Z",
        },
        calls: [
          {
            id: "1",
            at: "2026-11-09T00:37:20Z",
            category: "model",
            action: "提交生成",
            actorType: "user",
            method: "POST",
            path: "/openapi/v1/generations",
            status: 200,
            durationMs: 1800,
            request: '{"prompt":"跳舞","duration":30}',
            response: '{"id":"task-x"}',
          },
          {
            id: "2",
            at: "2026-11-09T00:53:20Z",
            category: "model",
            action: "查询生成结果",
            actorType: "user",
            method: "GET",
            path: "/v1/tasks/task-x",
            status: 200,
            durationMs: 200,
            response: '{"status":"failed","error":"content_policy_violation"}',
          },
        ],
        polls: 42,
        morePolls: false,
      },
    }),
  );
  await page.getByRole("button", { name: "生成任务", exact: true }).click();
  await page
    .locator("tbody tr")
    .first()
    .getByRole("button", { name: /详情/ })
    .click();
  const d = page.getByRole("dialog", { name: "生成记录详情" });
  await expect(d.getByRole("region", { name: "失败原因" })).toContainText(
    "内容审核未通过",
  );
  await expect(d.getByRole("region", { name: "失败原因" })).toContainText(
    "content_policy_violation",
  );
  await expect(d.getByRole("region", { name: "提示词" })).toContainText(
    "沙漠里跳舞",
  );
  const inputs = d.getByRole("region", { name: "输入素材" });
  await expect(inputs.locator("img")).toHaveCount(1);
  await expect(inputs.locator("video")).toHaveCount(1);
  await expect(inputs.locator("audio")).toHaveCount(1);
  await expect(d.getByRole("region", { name: "生成参数" })).toContainText(
    "多素材参考（multi_ref）",
  );
  await expect(d.getByRole("region", { name: "生成参数" })).toContainText(
    "16分10秒",
  );
  const calls = d.getByRole("region", { name: "模型调用" });
  await expect(calls.locator("details[open]")).toHaveCount(2);
  await expect(calls).toContainText('"duration": 30');
  await expect(calls).toContainText("共查询生成结果 42 次");
  expect(
    await d.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBeTruthy();
});
