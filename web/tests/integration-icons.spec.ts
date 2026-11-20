import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { groupMeta } from "../src/integrations/meta";

// Every group the server defines (settings/schema.go) has an icon and a
// description in 服务接入配置; a new group without one shows a blank tile.
test("every integration group has an icon and a description", () => {
  const schema = readFileSync("../server/internal/settings/schema.go", "utf8");
  const ids = [...schema.matchAll(/\{ID: "([a-z]+)", Name:/g)].map((m) => m[1]);
  expect(ids).toContain("chat");
  for (const id of ids) {
    expect(groupMeta[id]?.icon, id).toBeTruthy();
    expect(groupMeta[id]?.desc, id).toBeTruthy();
  }
});
