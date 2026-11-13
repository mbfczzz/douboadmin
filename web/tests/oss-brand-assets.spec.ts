import { test, expect } from "@playwright/test";
import path from "node:path";
import { modelPage, openModels } from "./model-tab-fixture";

test("logo and model picker load OSS URLs without local image fallback", async ({
  page,
}) => {
  const localImages: string[] = [];
  page.on("request", (request) => {
    if (
      request.resourceType() === "image" &&
      new URL(request.url()).origin === "http://127.0.0.1:5174"
    )
      localImages.push(request.url());
  });
  await openModels(page, (route) =>
    route.fulfill({ json: modelPage("image") }),
  );
  let requests = 0;
  const icon = "https://assets.example.test/brand.png";
  const modelIcon = "https://assets.example.test/model.png";
  await page.route("https://assets.example.test/**", (route) =>
    route.fulfill({
      path: path.resolve("../media/model-icons/openai.png"),
      contentType: "image/png",
    }),
  );
  await page.route("**/api/branding", (route) => {
    requests++;
    return route.fulfill({
      json: {
        icon,
        modelIcons: {
          "/media/model-icons/openai.png": modelIcon,
          "/media/model-icons/google.png": "http://unsafe.test/icon.png",
        },
      },
    });
  });
  await page.reload();
  await expect(page.locator(".sidebar img.project-logo")).toHaveAttribute(
    "src",
    icon,
  );
  await page.getByRole("button", { name: "基础信息", exact: true }).click();
  await expect(
    page
      .getByRole("button", { name: "OpenAI / GPT", exact: true })
      .locator("img"),
  ).toHaveAttribute("src", modelIcon);
  await expect(
    page.getByRole("button", { name: "Google", exact: true }).locator("img"),
  ).toHaveCount(0);
  expect(requests).toBe(1);
  expect(localImages).toEqual([]);
});
