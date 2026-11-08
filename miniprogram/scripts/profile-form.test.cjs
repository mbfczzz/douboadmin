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
  page.input(event("phone", "123"));
  await page.save();
  assert.equal(writes, 0);
  assert.equal(page.data.focusedField, "nickname");
  assert.match(page.data.fieldErrors.nickname, /昵称/);
  assert.match(page.data.fieldErrors.phone, /手机号/);
  page.input(event("phone", "13800000000"));
  assert.equal(page.data.fieldErrors.phone, "");
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
  page.focus(event("phone"));
  page.blur(event("phone", "not-a-number"));
  assert.match(page.data.fieldErrors.phone, /手机号/);
  assert.equal(page.data.phone, "not-a-number");
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

test("optional phones follow the backend contract without restricting international numbers", async () => {
  for (const phone of ["", "+8613800000000", "123-4567", "123456"]) {
    const { h, page } = await editor();
    let writes = 0;
    h.api.request = async () => {
      writes++;
      return {};
    };
    h.wx.navigateBack = (options) => options.success({});
    page.input(event("nickname", "新昵称"));
    page.input(event("phone", phone));
    await page.save();
    assert.equal(writes, ["", "+8613800000000"].includes(phone) ? 1 : 0, phone);
  }
});
