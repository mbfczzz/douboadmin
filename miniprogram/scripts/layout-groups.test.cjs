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

test("balance cards no longer separate editor parameters or profile statistics", () => {
  const create = source("create"),
    mine = source("mine");
  assert.ok(
    create.indexOf("<points-balance") > create.indexOf('class="ratio-grid"'),
  );
  assert.ok(
    create.indexOf("<points-balance") < create.indexOf('class="queue-link"'),
  );
  assert.ok(mine.indexOf('class="numbers"') < mine.indexOf("<points-balance"));
  assert.ok(mine.indexOf('class="works"') < mine.indexOf("<points-balance"));
  assert.ok(
    mine.indexOf("<points-balance") <
      mine.indexOf('class="section-title common-heading"'),
  );
});

test("profile fields share explicit grouping while preserving form field names", () => {
  const mine = source("mine");
  assert.equal((mine.match(/class="profile-field"/g) || []).length, 4);
  for (const field of ["nickname", "name", "phone", "bio"])
    assert.ok(mine.includes(`name="${field}"`));
  assert.ok(mine.includes('scroll-y class="profile-sheet-scroll"'));
  assert.ok(!mine.includes("bio-label"));
});

test("missing covers have a distinct media-aware placeholder separate from status", () => {
  const mine = source("mine");
  assert.match(mine, /class="work-placeholder"[\s\S]*?'image':'play-circle'/);
  assert.match(mine, /<\/view>\s*<text class="work-state">/);
  assert.ok(mine.includes('src="{{item.result}}"'));
});
