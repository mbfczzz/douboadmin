const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./harness.cjs');

const template = () => ({ id: 'recipe', data: {
  kind: 'video', title: '完整模板', prompt: '', cover: 'https://example.test/cover.jpg', model: 'default', selectableModels: ['choice', 'too-short'],
  resolution: '720p', ratio: '9:16', duration: 30, quality: '', mode: 'omni_ref', requiredImages: 2,
  imageSlots: [{ label: '人物', optional: false }, { label: '场景', optional: true }, { label: '商品', optional: false }],
} });
const model = (id, resolutions = ['720p'], durations = [30]) => ({ id, kind: 'video', name: id,
  resolutions, durations, ratios: ['9:16'], modes: ['omni_ref'], qualities: [], referenceTypes: ['image'] });
const asset = (id) => ({ id, data: { url: `https://example.test/${id}.jpg`, type: 'image/jpeg' } });

test('recipe images retain semantic positions after omitted optional slots, replacement and removal', async () => {
  const h = harness(), page = h.page('template-detail');
  const recipe = h.service('../pages/template-detail/recipe');
  h.api.request = async (path) => path.startsWith('/templates/') ? template() : { models: [model('choice', ['1080p', '720p']), model('default'), model('too-short', ['720p'], [15]), model('unlisted'),
    { ...model('no-images'), referenceTypes: [] }, { ...model('i2v-only'), modes: ['i2v'] },
    { ...model('one-image'), referenceRules: { omni_ref: { image: { maxCount: 1 } } } },
    { ...model('video-only-omni'), referenceRules: { omni_ref: { video: { maxCount: 3 } } } }] };
  page.id = 'recipe';
  await page.load();
  // Any model supporting 30 s, 9:16, 全能参考 and images, in the admin's model order; default preselected.
  assert.deepEqual(Array.from(page.data.recipeModels, m => m.id), ['choice', 'default', 'unlisted']);
  assert.equal(page.data.recipeModel, 'default');
  assert.equal(page.data.recipeMissing, 2);
  recipe.recipeAsset(page, 3, asset('product'));
  recipe.recipeAsset(page, 1, asset('person'));
  assert.deepEqual(Array.from(page.data.recipePositions), [1, 3]);
  assert.equal(page.data.recipeMissing, 0);
  assert.deepEqual(Array.from(page.data.recipeSlots, s => [s.label, s.id]), [['人物', 'person'], ['商品', 'product'], ['场景', '']]);
  recipe.recipeAsset(page, 2, asset('person'));
  assert.deepEqual(Array.from(page.data.recipePositions), [1, 3]);
  recipe.recipeAsset(page, 1, asset('replacement'));
  assert.deepEqual(Array.from(page.data.assets, a => a.id), ['replacement', 'product']);
  page.removeRecipeSlot({ currentTarget: { dataset: { position: 1 } } });
  assert.equal(page.data.recipeMissing, 1);
  assert.deepEqual(Array.from(page.data.recipePositions), [3]);
  recipe.recipeAsset(page, 1, asset('person'));
  const pick = (sheet, index) => {
    page.openRecipeSheet({ currentTarget: { dataset: { sheet } } });
    assert.equal(page.data.recipeSheet, sheet);
    page.pickRecipeOption({ currentTarget: { dataset: { index } } });
    assert.equal(page.data.recipeSheet, "");
  };
  pick("model", 0);
  pick("resolution", 1);
  let submitted;
  h.api.submitInput = async input => { submitted = input; return { id: 'task' }; };
  await page.generate();
  assert.equal(submitted.model, 'choice');
  assert.equal(submitted.resolution, '1080p');
  assert.equal(submitted.prompt, '');
  assert.deepEqual(Array.from(submitted.imageSlots), [1, 3]);
  assert.deepEqual(Array.from(submitted.assets), ['person', 'product']);
});

test('missing required positions block generation even when the total photo count is sufficient', async () => {
  const h = harness(), page = h.page('template-detail');
  h.api.request = async path => path.startsWith('/templates/') ? template() : { models: [model('default')] };
  page.id = 'recipe';
  await page.load();
  const recipe = h.service('../pages/template-detail/recipe');
  recipe.recipeAsset(page, 1, asset('person'));
  recipe.recipeAsset(page, 2, asset('scene'));
  let submissions = 0;
  h.api.submitInput = async () => { submissions++; return { id: 'bad' }; };
  await page.generate();
  assert.equal(submissions, 0);
  assert.equal(page.data.recipeMissing, 1);
});

test('changing image roles clears old uploads instead of silently rebinding them', async () => {
  const h = harness(), page = h.page('template-detail');
  let value = template();
  h.api.request = async path => path.startsWith('/templates/') ? value : { models: [model('default')] };
  page.id = 'recipe'; await page.load();
  h.service('../pages/template-detail/recipe').recipeAsset(page, 1, asset('person'));
  value = template(); value.data.imageSlots[0].label = '门店';
  await page.load();
  assert.equal(page.data.assets.length, 0);
  assert.equal(page.data.recipePositions.length, 0);
});

test('a recipe submits the same quality as its selected model quote', async () => {
  for (const qualities of [[], ['standard']]) {
    const h = harness(), page = h.page('template-detail'), t = template();
    t.data.quality = 'high';
    h.api.request = async path => path.startsWith('/templates/') ? t :
      { models: [{ ...model('choice'), qualities }] };
    page.id = t.id;
    await page.load();
    const recipe = h.service('../pages/template-detail/recipe');
    recipe.recipeAsset(page, 1, asset('person'));
    recipe.recipeAsset(page, 3, asset('product'));
    let submitted;
    h.api.submitInput = async input => { submitted = input; return { id: 'task' }; };
    await page.generate();
    assert.equal(submitted.quality, qualities[0] || '');
    assert.equal(submitted.quality, page.data.recipeModels[0].quality);
  }
});
