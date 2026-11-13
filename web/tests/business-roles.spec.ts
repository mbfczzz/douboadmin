import { test, expect } from "@playwright/test";
import { mockLogin } from "./mock-login";

test("shared business roles are visible and member editing never requests admin menus", async ({
  page,
}) => {
  await mockLogin(page);
  const rows = [
    {
      id: "branch",
      data: {
        name: "分公司",
        scope: "partner",
        menus: ["partners"],
        system: true,
      },
    },
    {
      id: "s1",
      data: {
        name: "S1 服务商",
        scope: "partner",
        menus: ["partners"],
        system: true,
      },
    },
    {
      id: "s2",
      data: {
        name: "S2 推荐官",
        scope: "partner",
        menus: ["partners"],
        system: true,
      },
    },
    {
      id: "member",
      data: { name: "会员", scope: "user", menus: [], system: true },
    },
  ].map((row) => ({ ...row, version: 0, accounts: 0 }));
  const writes: unknown[] = [];
  await page.route(/\/api\/admin\/roles(?:\?|$|\/)/, (route) => {
    if (route.request().method() === "PUT") {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: { items: rows, page: 1, size: 20, total: 4 },
    });
  });
  await page.getByRole("button", { name: "角色管理", exact: true }).click();
  for (const label of ["分公司", "S1 服务商", "S2 推荐官", "会员"]) {
    await expect(
      page.getByRole("cell", { name: label + " 内置", exact: true }),
    ).toBeVisible();
  }
  const branch = page.getByRole("row").filter({has:page.getByRole("cell",{name:"分公司 内置",exact:true})});
  await branch.getByRole("button",{name:"编辑",exact:true}).click();
  const fixed = page.getByRole("dialog",{name:"编辑角色",exact:true});
  await expect(fixed.getByRole("checkbox")).toHaveCount(0);
  await expect(fixed).toContainText("给下级设置算力分佣、查看下级活动轨迹、查看分佣");
  await fixed.getByRole("button",{name:"关闭",exact:true}).click();
  const member = page
    .getByRole("row")
    .filter({
      has: page.getByRole("cell", { name: "会员 内置", exact: true }),
    });
  await expect(member).toContainText("小程序角色");
  await expect(member).toContainText("无后台菜单");
  await expect(
    member.getByRole("button", { name: "删除", exact: true }),
  ).toHaveCount(0);
  await member.getByRole("button", { name: "编辑", exact: true }).click();
  const form = page.getByRole("dialog", { name: "编辑角色", exact: true });
  await expect(form.getByRole("checkbox")).toHaveCount(0);
  await form.getByLabel("角色名称").fill("创作会员");
  await form.getByRole("button", { name: "保存角色", exact: true }).click();
  await page
    .locator('[role="dialog"].save-confirmation')
    .getByRole("button", { name: "确认提交", exact: true })
    .click();
  await expect(form).toHaveCount(0);
  expect(writes).toEqual([
    { name: "创作会员", scope: "user", menus: [], version: 0 },
  ]);
});
