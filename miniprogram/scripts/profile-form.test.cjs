const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

async function editor() {
  const h = harness();
  await h.api.signIn();
  h.api.request = async () => ({
    profile: {
      version: 1,
      data: {
        nickname: "小豆",
        bio: "",
        name: "",
        phone: "",
      },
    },
  });
  const page = h.page("profile");
  await page.load();
  return { h, page };
}
const event = (field, value, next) => ({
  currentTarget: { dataset: { field, next } },
  detail: { value },
});

test("local field errors block writes and correcting one field preserves other errors", async () => {
  const { h, page } = await editor();
  let writes = 0;
  h.api.request = async () => {
    writes++;
  };
  page.input(event("nickname", ""));
  page.input(event("bio", "长".repeat(121)));
  await page.save();
  assert.equal(writes, 0);
  assert.equal(page.data.focusedField, "nickname");
  assert.match(page.data.fieldErrors.nickname, /昵称/);
  assert.match(page.data.fieldErrors.bio, /简介/);
  page.input(event("bio", "短简介"));
  assert.equal(page.data.fieldErrors.bio, "");
  assert.match(page.data.fieldErrors.nickname, /昵称/);
});

test("keyboard next preserves the entered value and a late blur cannot remove the next focus", async () => {
  const { h, page } = await editor();
  let hidden = 0,
    writes = 0;
  h.wx.hideKeyboard = () => {
    hidden++;
  };
  h.api.request = async () => {
    writes++;
  };
  page.focus(event("nickname"));
  page.next(event("nickname", "刚填的昵称", "name"));
  page.blur(event("nickname", "刚填的昵称"));
  assert.equal(page.data.nickname, "刚填的昵称");
  assert.equal(page.data.focusedField, "name");
  page.next(event("name", "姓名", "phone"));
  page.next(event("phone", "13800000000", "bio"));
  assert.equal(page.data.focusedField, "bio");
  page.done();
  assert.equal(hidden, 1);
  assert.equal(page.data.focusedField, "");
  assert.equal(writes, 0);
  assert.equal(page.saved, false);
});

test("blur validates only its own field and retains its draft", async () => {
  const { page } = await editor();
  page.focus(event("bio"));
  page.blur(event("bio", "长".repeat(121)));
  assert.match(page.data.fieldErrors.bio, /简介/);
  assert.equal(page.data.nickname, "小豆");
  assert.equal(page.data.fieldErrors.nickname, undefined);
  assert.equal(page.data.bio, "长".repeat(121));
  assert.equal(page.data.focusedField, "");
  assert.equal(page.data.dirty, true);
});

test("save reads the latest native form nickname and confirms success after returning", async () => {
  const { h, page } = await editor(),
    actions = [];
  let written;
  h.api.request = async (_path, method, data) => {
    if (method === "PUT") written = data;
    return {};
  };
  h.wx.navigateBack = (options) => {
    actions.push("back");
    options.success({});
  };
  h.wx.showToast = (options) => {
    actions.push(options.title);
  };
  await page.save({ detail: { value: { nickname: "微信刚填的昵称" } } });
  assert.equal(written.nickname, "微信刚填的昵称");
  assert.deepEqual(actions, ["back", "已保存"]);
  assert.equal(page.data.dirty, false);
});

test("the SMS-verified phone is read-only and saved unchanged", async () => {
  const { h, page } = await editor();
  let written;
  h.api.request = async (_path, method, data) => {
    if (method === "PUT") written = data;
    return {};
  };
  h.wx.navigateBack = (options) => options.success({});
  page.input(event("phone", "13900000000"));
  assert.equal(page.data.phone, "");
  page.input(event("nickname", "新昵称"));
  await page.save({ detail: { value: { phone: "13900000000" } } });
  assert.equal(written.nickname, "新昵称");
  assert.equal(written.phone, "");
});
