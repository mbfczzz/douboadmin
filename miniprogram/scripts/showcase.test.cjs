const { test } = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./harness.cjs");

const tick = () => new Promise((r) => setTimeout(r, 0));

test("empty states fan out the first three template covers and open the one tapped", async () => {
  const h = harness();
  const asked = [];
  h.wx.request = (o) => {
    asked.push(o.url);
    queueMicrotask(() =>
      o.success({
        statusCode: 200,
        data: {
          items: [
            { id: "a", data: { cover: "/media/a.jpg" } },
            { id: "b", data: { cover: "" } },
            { id: "c", data: { cover: "https://cdn.example/c.jpg" } },
            { id: "d", data: { cover: "https://cdn.example/d.jpg" } },
          ],
        },
      }),
    );
  };
  const show = h.component("components/showcase");
  show.lifetimes.attached.call(show);
  await tick();
  await tick();
  assert.equal(asked.length, 1);
  assert.match(asked[0], /\/templates\?kind=video&page=1&size=6$/);
  assert.deepEqual(
    show.data.covers.map((c) => c.id),
    ["a", "c", "d"],
  );
  assert.match(show.data.covers[0].cover, /^https?:\/\/.+\/media\/a\.jpg$/);
  // Another empty state reuses the covers already loaded.
  show.setData({ covers: [] });
  show.lifetimes.attached.call(show);
  await tick();
  assert.equal(asked.length, 1);
  assert.equal(show.data.covers.length, 3);
  show.open({ currentTarget: { dataset: { id: "c" } } });
  assert.equal(h.nav.at(-1).url, "/pages/template-detail/index?id=c");
  show.open({ currentTarget: { dataset: {} } });
  assert.equal(h.nav.length, 1);
});
