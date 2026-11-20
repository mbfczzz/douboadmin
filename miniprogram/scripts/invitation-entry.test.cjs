const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");
function setup() {
  const h = harness(),
    p = h.page("activate"),
    inv = h.service("invitation");
  p.setData({
    logged: true,
    loading: false,
    status: { active: false, status: "pending", profileRequired: false },
  });
  return { h, p, inv };
}
// Registering acts only for the signed-in user the page loaded for (an
// account switched meanwhile reloads instead), as on a real visit.
async function signedIn(h, p) {
  await h.api.signIn();
  p.owner = h.service("session").sessionUserId();
}
test("external mini-code waits for profile then joins without invoking scan", async () => {
  const { h, p, inv } = setup();
  await signedIn(h, p);
  p.onLoad({ scene: "ABCD2345" });
  let calls = [];
  h.api.request = async (path, method, data) => {
    calls.push({ path, method, data });
    return { active: false, status: "review" };
  };
  p.setData({
    status: { active: false, status: "pending", profileRequired: true },
  });
  await p.joinInvite();
  assert.equal(calls.length, 0);
  p.setData({
    status: { active: false, status: "pending", profileRequired: false },
  });
  await p.joinInvite();
  await p.joinInvite();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/access/join");
  assert.equal(calls[0].data.code, "ABCD2345");
  assert.equal(calls[0].data.method, "scan");
  assert.equal(inv.pendingInvite(), "");
  assert.equal(p.data.status.status, "review");
});
test("pending invite survives login wait and failed registration has explicit retry", async () => {
  const { h, p, inv } = setup();
  await signedIn(h, p);
  p.onLoad({ scene: "WXYZ6789" });
  p.setData({ logged: false });
  await p.joinInvite();
  assert.equal(inv.pendingInvite(), "WXYZ6789");
  let calls = 0;
  h.api.request = async () => {
    calls++;
    throw new Error("network");
  };
  p.setData({ logged: true });
  await p.joinInvite();
  await p.joinInvite();
  assert.equal(calls, 1);
  p.inviteAttempt = "";
  await p.joinInvite();
  assert.equal(calls, 2);
});
test("malformed scenes and already active accounts do not register", async () => {
  const { h, p, inv } = setup();
  p.onLoad({ scene: "%invalid" });
  assert.equal(inv.pendingInvite(), "");
  p.onLoad({ scene: "ABCD2345" });
  p.setData({ status: { active: true, status: "active" } });
  let calls = 0;
  h.api.request = async () => {
    calls++;
    return {};
  };
  await p.joinInvite();
  assert.equal(calls, 0);
});

test("in-app scanner accepts both mini-code scene paths and legacy QR text", () => {
  const inv = harness().service("invitation");
  assert.equal(inv.scannedInvite({result:"",path:"pages/activate/index?scene=ABCD2345"}),"ABCD2345");
  assert.equal(inv.scannedInvite({result:"DOUBO-SHARE:WXYZ6789"}),"WXYZ6789");
  assert.throws(()=>inv.scannedInvite({result:"",path:"pages/activate/index?scene=%"}));
});

test("a page loaded for another account does not register; it reloads instead", async () => {
  const { h, p } = setup();
  await signedIn(h, p);
  p.owner = "someone-else"; // the account changed while the page was open
  const paths = [];
  h.api.request = async (path) => (paths.push(path), { active: false, status: "pending", profileRequired: false });
  p.onLoad({ scene: "ABCD2345" });
  await p.joinInvite();
  assert.ok(!paths.includes("/access/join"), "joined for a stale account");
});
