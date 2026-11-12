import { test, expect } from "@playwright/test";
import { mockLogin } from "./mock-login";
import { confirmSubmission } from "./helpers";

test("SMS verification can be disabled and enabled without clearing credentials", async ({ page }) => {
  await mockLogin(page);
  const group = {
    id: "sms", name: "短信验证码", hint: "保存后重启服务生效。",
    version: 1, appliedVersion: 1, pendingRestart: false, source: "database",
    fields: [
      { key: "SMS_VERIFICATION_ENABLED", label: "开启短信验证", kind: "bool",
        hint: "关闭后仅填写姓名和手机号，不发送或校验验证码。" },
      { key: "SMS_ACCESS_KEY_ID", label: "AccessKey ID", kind: "secret" },
      { key: "SMS_ACCESS_KEY_SECRET", label: "AccessKey Secret", kind: "secret" },
      { key: "SMS_SIGN_NAME", label: "短信签名", kind: "text" },
      { key: "SMS_TEMPLATE_CODE", label: "验证码模板 CODE", kind: "text" },
    ],
    values: {
      SMS_VERIFICATION_ENABLED: "true", SMS_ACCESS_KEY_ID: "fixture-id",
      SMS_ACCESS_KEY_SECRET: "fixture-secret", SMS_SIGN_NAME: "测试签名", SMS_TEMPLATE_CODE: "SMS_123",
    },
    secrets: { SMS_ACCESS_KEY_ID: true, SMS_ACCESS_KEY_SECRET: true },
  };
  const writes: { values: typeof group.values; clear: string[]; version: number }[] = [];
  await page.route("**/api/admin/integrations", route => route.fulfill({
    json: { canManage: true, available: true, groups: [group], keyFile: "fixture" },
  }));
  await page.route("**/api/admin/integrations/sms", route => {
    const update = route.request().postDataJSON();
    writes.push(update);
    group.values = update.values;
    group.version++;
    group.pendingRestart = true;
    return route.fulfill({ json: { canManage: true, available: true, groups: [group] } });
  });
  await page.getByRole("button", { name: "系统设置", exact: true }).click();
  const card = page.locator("#integration-sms");
  await card.locator("summary").click();
  const toggle = card.getByRole("checkbox", { name: /开启短信验证/ });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await card.getByRole("button", { name: "保存配置", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "返回修改", exact: true }).click();
  expect(writes).toHaveLength(0);
  await expect(toggle).not.toBeChecked();
  for (const enabled of [false, true]) {
    await toggle.setChecked(enabled);
    await card.getByRole("button", { name: "保存配置", exact: true }).click();
    await confirmSubmission(page);
    await expect(card.locator("summary")).toContainText("待重启");
    await expect.poll(() => writes.at(-1)?.values.SMS_VERIFICATION_ENABLED).toBe(String(enabled));
    expect(writes.at(-1)?.clear).toEqual([]);
    expect(writes.at(-1)?.values.SMS_ACCESS_KEY_SECRET).toBe("fixture-secret");
    await expect(card.getByLabel("短信签名", { exact: true })).toHaveValue("测试签名");
  }
  await page.screenshot({ path: "../.runtime/sms-switch-admin.png", fullPage: true });
});
