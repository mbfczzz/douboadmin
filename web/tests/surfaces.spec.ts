import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import type { Row, Model } from "../src/api";
import { login } from "./helpers";
import { surfaceFixtures, longName } from "./surface-fixtures";
import { inspectModal } from "./modal-audit";

for (const width of [1440, 390, 320]) {
  test(`read-only UI surface inventory at ${width}px`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    page.setDefaultTimeout(10000);
    await login(page);
    const models: Row<Model>[] = await surfaceFixtures(page);
    const surfaces: object[] = [],
      issues: string[] = [];
    async function inspect(name: string) {
      const dialog = page.getByRole("dialog").last();
      const scope = (await dialog.count()) ? dialog : page.locator(".content");
      const shape = await scope.evaluate((el) => ({
        overflow: el.scrollWidth > el.clientWidth + 2,
        width: el.clientWidth,
        scroll: el.scrollWidth,
        innerOverflow: [
          ...el.querySelectorAll<HTMLElement>(
            ".form-body,.model-config-body,.edit-form",
          ),
        ]
          .filter((e) => e.scrollWidth > e.clientWidth + 2)
          .map((e) => e.className),
        checkboxes: [
          ...el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
        ]
          .filter(
            (e) =>
              e.getClientRects().length && e.getBoundingClientRect().width > 40,
          )
          .map((e) => e.name || e.parentElement?.textContent?.slice(0, 25)),
      }));
      if (
        shape.overflow ||
        shape.innerOverflow.length ||
        shape.checkboxes.length
      )
        issues.push(`${name}: ${JSON.stringify(shape)}`);
      const selects = scope.locator("select:enabled"),
        count = await selects.count();
      for (let i = 0; i < count; i++) {
        const value = await selects.nth(i).inputValue();
        await selects.nth(i).click();
        const before = await page.getByRole("dialog").count();
        await page.keyboard.press("Escape");
        expect(await page.getByRole("dialog").count()).toBe(before);
        await expect(selects.nth(i)).toHaveValue(value);
      }
      surfaces.push({ name, selects: count, ...shape });
      if (await dialog.count()) await inspectModal(page, `${width}-${name}`);
      if (
        name === "名额划拨 / 收回" ||
        name === "长名称服务商" ||
        name === "分佣子页面"
      )
        await page.screenshot({
          path: `../.runtime/surfaces-${width}-${name.replaceAll(" / ", "-")}.png`,
        });
    }
    async function nav(name: string) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page
        .locator("nav")
        .getByRole("button", { name, exact: true })
        .click();
      if (name === "服务商管理")
        await expect(
          page.getByRole("heading", { name: "服务商列表", exact: true }),
        ).toBeVisible();
      else
        await expect(
          page.getByRole("heading", { name, exact: true }),
        ).toBeVisible();
      await page.setViewportSize({ width, height: 900 });
    }
    async function modal(
      button: string,
      title: string,
      scope = page.locator(".content"),
    ) {
      await scope
        .getByRole("button", { name: button, exact: true })
        .first()
        .click();
      const d = page.getByRole("dialog", { name: title, exact: true });
      await expect(d).toBeVisible();
      await inspect(title);
      await d.getByRole("button", { name: "关闭", exact: true }).click();
    }
    await nav("创作模板");
    await modal("新增模板", "新增创作模板");
    await modal("编辑", "编辑创作模板");
    await page.getByRole("button", { name: "新增模板", exact: true }).click();
    const template = page.getByRole("dialog");
    await template
      .getByRole("combobox", { name: "模板栏目", exact: true })
      .focus();
    // The themed select follows the combobox pattern: ↓ opens the list,
    // arrows move and Enter picks.
    for (const key of ["ArrowDown", "ArrowDown", "Enter"])
      await page.keyboard.press(key);
    await expect(
      template.getByRole("combobox", { name: "模板栏目", exact: true }),
    ).toHaveValue("inspiration");
    for (const key of ["ArrowDown", "ArrowUp", "Enter"])
      await page.keyboard.press(key);
    await expect(
      template.getByRole("combobox", { name: "模板栏目", exact: true }),
    ).toHaveValue("style");
    for (const kind of ["image", "video"]) {
      const model = models.find(
        (r) => r.data.kind === kind && r.data.available,
      );
      if (!model) continue;
      await template
        .getByRole("combobox", { name: "生成类型", exact: true })
        .selectOption(kind);
      await template
        .getByRole("combobox", { name: "关联模型", exact: true })
        .selectOption(model.id);
      await inspect(kind === "image" ? "图片模板参数" : "视频模板参数");
    }
    page.once("dialog", (d) => d.accept());
    await template.getByRole("button", { name: "关闭", exact: true }).click();
    await nav("模型管理");
    await modal("新增模型", "添加上游模型");
    for (const kind of [...new Set(models.map((m) => m.data.kind))]) {
      const model = models.find((m) => m.data.kind === kind)!;
      await page.getByLabel("搜索模型").fill(model.data.key);
      const item = page
        .locator("tbody tr")
        .filter({ has: page.getByText(model.data.key, { exact: true }) });
      await item
        .getByRole("button", { name: "配置", exact: true })
        .first()
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      let edited = false;
      const addTag = page
        .getByRole("dialog")
        .getByRole("button", { name: "添加标签", exact: true });
      if (kind === "image" && (await addTag.isEnabled())) {
        await addTag.click();
        edited = true;
      }
      await inspect("配置模型 · " + kind);
      if (edited) page.once("dialog", (d) => d.accept());
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "关闭", exact: true })
        .click();
    }
    await nav("生成任务");
    await modal("详情", "任务详情");
    await nav("作品管理");
    await modal("预览", "作品预览");
    await nav("内容审核");
    await modal("查看并审核", "作品审核");
    await nav("充值订单");
    await modal("详情", "充值订单详情");
    await nav("管理账号");
    await modal("添加管理账号", "添加管理账号");
    await modal("编辑", "编辑管理账号");
    await nav("小程序用户");
    await modal("详情 / 积分", "小程序用户与积分");
    await nav("服务商管理");
    const providerName = page.locator(".provider-tree-name b:visible").first();
    await expect(providerName).toBeVisible();
    expect(
      await providerName.evaluate(
        (el) =>
          el.scrollWidth <= el.clientWidth &&
          getComputedStyle(el).whiteSpace === "normal",
      ),
    ).toBeTruthy();
    await modal("新增服务商", "新增服务商");
    const provider = page
      .locator(".provider-tree-row")
      .filter({ hasText: longName });
    await modal("编辑", "编辑服务商", provider);
    await inspect("长名称服务商");
    await info.attach("surface-inventory", {
      body: JSON.stringify({ surfaces, issues }, null, 2),
      contentType: "application/json",
    });
    writeFileSync(
      `../.runtime/qa-surfaces-${width}.json`,
      JSON.stringify({ surfaces, issues }, null, 2),
    );
    expect(issues).toEqual([]);
  });
}
