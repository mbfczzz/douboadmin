const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

test("an uncertain submit retry reuses both its idempotency key and approved price", async () => {
  const h = harness();
  await h.api.signIn();
  let quotes = 0,
    creates = 0;
  const requests = [];
  h.wx.showModal = async () => ({ confirm: true });
  h.wx.request = (o) => {
    if (o.url.endsWith("/jobs/quote")) {
      quotes++;
      o.success({
        statusCode: 200,
        data: {
          units: 300,
          billingEnabled: true,
          sufficient: true,
          availableUnits: 1000,
        },
      });
      return;
    }
    if (o.url.endsWith("/jobs")) {
      creates++;
      requests.push(o);
      if (creates === 1) o.fail();
      else o.success({ statusCode: 202, data: { id: "task" } });
    }
  };
  const input = {
    kind: "image",
    prompt: "一个产品画面",
    model: "image",
    resolution: "1k",
    ratio: "1:1",
    duration: 0,
    assets: [],
  };
  await assert.rejects(h.api.submitInput(input, "create"), /连接失败/);
  await h.api.submitInput(input, "create");
  assert.equal(quotes, 1);
  assert.equal(
    requests[0].header["Idempotency-Key"],
    requests[1].header["Idempotency-Key"],
  );
  assert.equal(requests[1].data.expectedCostUnits, 300);
});

test("insufficient balance never submits a generation and can lead to the wallet", async () => {
  const h = harness();
  await h.api.signIn();
  let submitted = 0;
  h.wx.showModal = async () => ({ confirm: true });
  h.wx.request = (o) => {
    if (o.url.endsWith("/jobs/quote"))
      o.success({
        statusCode: 200,
        data: {
          units: 300,
          billingEnabled: true,
          sufficient: false,
          availableUnits: 100,
        },
      });
    else submitted++;
  };
  await assert.rejects(
    h.api.submitInput({ kind: "image", model: "m", prompt: "作品" }, "create"),
  );
  assert.equal(submitted, 0);
  assert.equal(h.nav[0].url, "/pages/wallet/index");
});

test("unconfigured recharge cannot open the native payment sheet", async () => {
  const h = harness(),
    page = h.page("wallet");
  let payments = 0;
  h.wx.getDeviceInfo = () => ({ platform: "android" });
  h.wx.requestPayment = () => payments++;
  page.setData({
    amount: "10",
    info: {
      wallet: { userId: "u", availableUnits: 0, heldUnits: 0 },
      settings: {
        rechargeEnabled: false,
        minRechargeFen: 100,
        maxRechargeFen: 100000,
        pointsPerYuan: 100,
      },
      paymentReady: false,
      settingsVersion: 0,
    },
  });
  await page.pay();
  assert.equal(payments, 0);
  assert.equal(page.data.busy, false);
});
