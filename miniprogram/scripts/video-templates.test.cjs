const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./harness.cjs');

test('template discovery requests video templates explicitly', async () => {
  const h = harness(), page = h.page('templates');
  h.api.request = async path => {
    assert.equal(new URL(path, 'https://fixture.test').searchParams.get('kind'), 'video');
    return { items: [{ id: 'video-template', data: { kind: 'video', cover: '/cover.jpg' } }], total: 1 };
  };
  await page.load();
  assert.equal(page.data.items[0].id, 'video-template');
});

test('an old image template link is unavailable and cannot be submitted from cached state', async () => {
  const h = harness(), page = h.page('template-detail');
  const legacy = { id: 'old-image', data: { kind: 'image', cover: '/cover.jpg' } };
  let submits = 0;
  h.api.request = async () => legacy;
  h.api.submitInput = async () => { submits++; return { id: 'wrong' }; };
  page.id = legacy.id;
  await page.load();
  assert.equal(page.data.template, null);
  assert.equal(page.data.loadError, '模板已下架');
  page.setData({ template: legacy });
  await page.generate();
  assert.equal(submits, 0);
  assert.equal(page.data.busy, false);
});

test('video templates still submit video generation with required reference images', async () => {
  const h = harness(), page = h.page('template-detail');
  let sent;
  h.api.submitInput = async input => { sent = input; return { id: 'video-job' }; };
  page.setData({ template: { id: 'video-template', data: {
    kind: 'video', model: 'video-model', prompt: 'Product video', resolution: '720p',
    ratio: '16:9', duration: 5, mode: 'i2v', requiredImages: 1,
  } }, assets: [{ id: 'reference-image', data: {} }] });
  await page.generate();
  assert.equal(sent.kind, 'video');
  assert.equal(sent.templateId, 'video-template');
  assert.equal(sent.mode, 'i2v');
  assert.deepEqual(Array.from(sent.assets), ['reference-image']);
});
