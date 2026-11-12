const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const source = (page) => readFileSync(`pages/${page}/index.wxml`, "utf8");

test("task prompt heading and content stay adjacent; status and actions stay outside", () => {
  const text = source("task-detail");
  assert.match(
    text,
    /<text class="section-title">提示词<\/text>\s*<text class="full-prompt"/,
  );
  assert.ok(
    text.indexOf('class="stage-note"') < text.indexOf('class="waiting-note"'),
  );
  assert.ok(
    text.indexOf('bindtap="share"') < text.indexOf('class="full-prompt"'),
  );
  assert.ok(
    text.indexOf('class="billing-summary"') >
      text.indexOf('class="asset-grid"'),
  );
  assert.ok(text.indexOf("<points-balance") > text.indexOf('class="specs"'));
});

test("generation follows its parameters and profile balance precedes grouped menus", () => {
  const create = source("create"),
    mine = source("mine");
  assert.ok(
    create.indexOf("<points-balance") > create.indexOf('class="ratio-grid"'),
  );
  assert.ok(
    create.indexOf("<points-balance") < create.indexOf('class="queue-link"'),
  );
  assert.ok(create.indexOf('class="creation-action"') > create.indexOf('class="ratio-grid"'));
  assert.ok(create.indexOf('class="creation-action"') < create.indexOf("<points-balance"));
  assert.ok(mine.indexOf('class="profile"') < mine.indexOf("<points-balance"));
  assert.ok(
    mine.indexOf("<points-balance") <
      mine.indexOf('class="section-title common-heading"'),
  );
});

test("profile fields share explicit grouping while preserving form field names", () => {
  const profile = source("profile");
  assert.equal(
    (profile.match(/class="profile-field(?:\s|")/g) || []).length,
    4, // nickname, name, the verified phone and the identity label
  );
  for (const field of ["nickname", "name", "bio"])
    assert.ok(profile.includes(`name="${field}"`));
  // The SMS-verified phone is shown, not edited.
  assert.ok(!profile.includes('name="phone"'));
  assert.ok(profile.includes('class="profile-readonly"'));
  assert.ok(profile.includes('class="profile-bio'));
  assert.ok(!source("mine").includes("<t-popup"));
});

test("the compact profile uses icon-and-text menus without loading media previews", () => {
  const mine = source("mine");
  assert.match(mine, /class="icon-tile"[\s\S]*?name="{{item.icon}}"/);
  assert.ok(mine.includes('class="menu-label"'));
  assert.ok(mine.includes('item.group===group'));
  assert.ok(!mine.includes('class="works"'));
});
