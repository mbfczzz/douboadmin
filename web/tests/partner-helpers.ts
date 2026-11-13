import { expect, type APIRequestContext, type Page } from "@playwright/test";

// Only branches are manually created from the platform header.
export async function createProvider(page: Page, name: string) {
  await page.getByRole("button", { name: "新增分公司" }).click();
  const dialog = page.getByRole("dialog", {
    name: "新增分公司",
    exact: true,
  });
  await dialog.getByLabel("服务商名称").fill(name);
  await dialog.getByLabel("负责人手机号").fill("139" + String(Math.floor(Math.random() * 1e8)).padStart(8,"0"));
  // The login account and password come prefilled; keep the defaults.
  await expect(dialog.getByLabel("账号", { exact: true })).toHaveValue(
    /^sp\d{6}$/,
  );
  await expect(dialog.getByLabel("初始密码")).toHaveValue(/^(?=.*[a-z])(?=.*[A-Z])[A-Za-z0-9]{8}$/);
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/admin/partners" &&
      r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "保存服务商", exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(200);
  await expect(dialog).toHaveCount(0);
  return result.json();
}
// A provider's QR code of one kind (member, s1, s2 or bind), as the
// 分享码 dialog shows it.
export async function providerCode(
  request: APIRequestContext,
  partner: string,
  kind = "member",
) {
  const res = await request.get(`/api/admin/partners/${partner}/codes/${kind}`);
  expect(res.status()).toBe(200);
  const { code } = await res.json();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  return code as string;
}

// A signed-in mini-program user who finished the SMS registration step; the
// development server returns the code instead of sending it.
export async function miniUser(request: APIRequestContext, name = "验收用户") {
  const signIn = await request.post("/api/auth/login", {
    data: { demoId: crypto.randomUUID() },
  });
  expect(signIn.status()).toBe(200);
  const user: { token: string; userId: string } = await signIn.json(),
    headers = { Authorization: "Bearer " + user.token },
    phone = "139" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  const sent = await request.post("/api/access/sms", {
    headers,
    data: { phone },
  });
  expect(sent.status()).toBe(200);
  const registered = await request.post("/api/access/profile", {
    headers,
    data: { name, phone, code: (await sent.json()).debugCode },
  });
  expect(registered.status()).toBe(200);
  return { ...user, headers };
}

// Isolated acceptance setup follows the real invitation and approval flow.
export async function scanProvider(
  page: Page,
  parent: string,
  kind: "s1" | "s2",
  name: string,
) {
  const user = await miniUser(page.request, name);
  const joined = await page.request.post("/api/access/join", {
    headers: user.headers,
    data: {
      code: await providerCode(page.request, parent, kind),
      method: "scan",
    },
  });
  expect(joined.status()).toBe(200);
  const response = await page.request.get(
    `/api/admin/registrations?status=pending&q=${encodeURIComponent(user.userId)}`,
  );
  expect(response.status()).toBe(200);
  const pending = (await response.json()).items.find(
    (row: { id: string }) => row.id === user.userId,
  );
  expect(pending).toBeTruthy();
  const approved = await page.request.put(
    `/api/admin/registrations/${user.userId}`,
    {
      data: { approve: true, reason: "", version: pending.version },
    },
  );
  expect(approved.status()).toBe(200);
  const overview = await page.request.get(
    `/api/admin/partners/${pending.data.partnerId}`,
  );
  expect(overview.status()).toBe(200);
  return (await overview.json()).record;
}
