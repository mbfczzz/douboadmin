const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

const code = (c) => ({ code: c, qr: "data:image/png;base64,AAAA" });
const branch = {
  name: "华东分公司",
  status: "active",
  role: "branch",
  members: 4,
  codes: {
    member: code("ABCD2345"),
    s1: code("KMNP2345"),
    s2: code("WXYZ6789"),
  },
  children: [
    {
      id: "s1",
      name: "王五",
      role: "s1",
      status: "pending",
      members: 0,
      account: "",
      scanned: true,
      createdAt: "2026-11-10T08:00:00Z",
    },
  ],
  account: "13900000001",
  owner: false,
};

test("a 分公司 switches between its three codes and sees what is below it", async () => {
  const h = harness(),
    page = h.page("provider");
  h.api.request = async (path) => path.startsWith("/provider/children?")
    ? {items:branch.children,page:1,total:1,size:20} : branch;
  page.onLoad({});
  await page.load();
  assert.equal(page.data.roleName, "分公司");
  assert.deepEqual(
    JSON.parse(JSON.stringify(page.data.tabs.map((t) => t.label))),
    ["S1 服务商邀请码", "S2 推荐官邀请码", "子账号开通码"],
  );
  assert.equal(page.data.shown.code, "KMNP-2345");
  page.switchTab({ currentTarget: { dataset: { tab: "s2" } } });
  assert.equal(page.data.shown.code, "WXYZ-6789");
  assert.match(page.data.note, /S2 推荐官/);
  page.switchTab({ currentTarget: { dataset: { tab: "member" } } });
  assert.equal(page.data.shown.code, "ABCD-2345");
  assert.match(page.data.note, /直接归属当前服务商/);
  assert.equal(page.data.children[0].roleName, "S1 服务商");
  assert.equal(page.data.children[0].date, "2026-11-10");
});

test("an S2 has only its 子账号开通码", async () => {
  const h = harness(),
    page = h.page("provider");
  h.api.request = async () => ({
    ...branch,
    role: "s2",
    codes: { member: code("ABCD2345") },
    children: undefined,
  });
  page.onLoad({});
  await page.load();
  assert.equal(page.data.roleName, "S2 推荐官");
  assert.equal(page.data.tabs.length, 1);
  assert.equal(page.data.shown.code, "ABCD-2345");
});

test("a member's 推广码 uses the same page", async () => {
  const h = harness(),
    page = h.page("provider"),
    paths = [];
  h.api.request = async (path) => {
    paths.push(path);
    return code("PRMO2345");
  };
  page.onLoad({ mode: "promo" });
  await page.load();
  assert.deepEqual(paths, ["/promo"]);
  assert.equal(page.data.shown.code, "PRMO-2345");
  assert.equal(page.data.center, null);
});

test("a scanned provider keeps its password visible; a reset asks first", async () => {
  const h = harness(),
    page = h.page("provider");
  let resets = 0;
  h.api.request = async (path) => {
    if (path === "/provider/password") {
      resets++;
      return { account: "13800138000", password: "Nw".repeat(10) };
    }
    if (path.startsWith("/provider/children?")) return {items:branch.children,page:1,total:1,size:20};
    return { ...branch, owner: true, password: "Kp".repeat(10) };
  };
  page.onLoad({});
  await page.load();
  assert.equal(page.data.password, "Kp".repeat(10));
  h.wx.showModal = async () => ({ confirm: false });
  await page.password();
  assert.equal(resets, 0);
  h.wx.showModal = async () => ({ confirm: true });
  await page.password();
  assert.equal(resets, 1);
  assert.equal(page.data.password, "Nw".repeat(10));
});

test("provider children load the next server page and a failed page can be retried", async () => {
  const h=harness(), page=h.page("provider"), paths=[];
  let fail=true;
  h.api.request=async path=>{
    paths.push(path);
    if(path==="/provider?children=paged") return {...branch,children:undefined};
    if(path==="/provider/children?page=1") return {items:branch.children,page:1,size:20,total:21};
    if(path==="/provider/children?page=2") {
      if(fail) throw new Error("加载失败");
      return {items:[{...branch.children[0],id:"old-child",name:"历史下级"}],page:2,size:20,total:21};
    }
    throw new Error("unexpected path "+path);
  };
  page.onLoad({});
  await page.load();
  assert.equal(page.data.childrenTotal,21);
  assert.equal(page.data.childrenPage,1);
  assert.equal(page.data.children.length,1);
  await page.loadChildren();
  assert.equal(page.data.childrenPage,1);
  assert.match(page.data.childrenError,/加载失败/);
  fail=false;
  await page.loadChildren();
  assert.equal(page.data.childrenPage,2);
  assert.equal(page.data.children[1].name,"历史下级");
  assert.equal(page.data.childrenError,"");
  assert.equal(paths.filter(path=>path==="/provider/children?page=2").length,2);
});

test("late provider child response cannot update a hidden page", async ()=>{
  const h=harness(),page=h.page("provider");
  let release;
  h.api.request=()=>new Promise(resolve=>{release=resolve});
  const loading=page.loadChildren(true);
  page.onHide();
  release({items:branch.children,page:1,size:20,total:1});
  await loading;
  assert.equal(page.data.children.length,0);
  assert.equal(page.data.childrenLoading,false);
});

test("我的 shows 服务商中心 to providers and 我的推广码 to members", async () => {
  for (const [kind, mode] of [
    ["branch", "provider"],
    ["s2", "provider"],
    ["member", "promo"],
    ["", ""],
  ]) {
    const h = harness();
    await h.api.signIn();
    const page = h.page("mine");
    h.api.request = async (path) => (path === "/me/identity" ? { kind } : []);
    await page.loadIdentity();
    assert.equal(page.data.menus[0].mode === mode, mode !== "", kind || "none");
  }
});

test("the profile page shows the account's identity", async () => {
  const h = harness();
  await h.api.signIn();
  h.api.request = async (path) =>
    path === "/me/identity"
      ? { kind: "member", label: "会员", partner: "华东分公司" }
      : {
          profile: {
            version: 1,
            data: { nickname: "小豆", bio: "", name: "", phone: "" },
          },
        };
  const page = h.page("profile");
  await page.load();
  await new Promise(setImmediate);
  assert.equal(page.data.identity.label, "会员");
});
