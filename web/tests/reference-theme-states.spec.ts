import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { styles } from "./reference-theme-mini";

// Exercise the installed SDK's actual state rules, not a hand-drawn button.
const sdk = readFileSync("../miniprogram/node_modules/tdesign-miniprogram/miniprogram_dist/button/button.wxss", "utf8")
  .replace(/@import[^;]+;/g, "")
  .replace(/([\d.]+)rpx/g, (_, n) => `${Number(n)*390/750}px`);

for (const item of [
  {name:"login press",scope:"login-page",classes:"primary t-button--hover",bg:"rgb(0, 173, 189)",fg:"rgb(8, 43, 48)"},
  {name:"secondary press",scope:"",classes:"default t-button--hover",bg:"rgb(23, 54, 59)",fg:"rgb(244, 245, 247)"},
  {name:"text press",scope:"",classes:"default t-button--text t-button--hover",bg:"rgb(23, 54, 59)",fg:"rgb(244, 245, 247)"},
  {name:"disabled secondary",scope:"",classes:"default t-button--disabled",bg:"rgb(41, 44, 50)",fg:"rgb(133, 139, 150)"},
  {name:"primary outline press",scope:"",classes:"primary t-button--outline t-button--hover",bg:"rgb(23, 54, 59)",fg:"rgb(0, 173, 189)"},
  {name:"disabled primary outline",scope:"",classes:"primary t-button--outline t-button--disabled",bg:"rgba(0, 0, 0, 0)",fg:"rgb(166, 171, 181)"},
]) {
  test(`native SDK theme: ${item.name}`, async({page})=>{
    await page.setContent(styles(390,["pages/login/index.wxss"])+`<style>${sdk}</style><div class="${item.scope}"><button class="t-button t-button--${item.classes}">操作按钮</button></div>`);
    await expect(page.locator("button")).toHaveCSS("background-color",item.bg);
    await expect(page.locator("button")).toHaveCSS("color",item.fg);
  });
}

test("web login hover and disabled actions retain their state colors",async({page})=>{
  const css=["base","controls","login"].map(f=>readFileSync(`src/styles/${f}.css`,"utf8")).join("\n");
  await page.setContent(`<style>${css}</style><form class="login-form"><button class="primary">登录</button></form><button class="primary" disabled>禁用操作</button>`);
  await page.getByRole("button",{name:"登录",exact:true}).hover();
  await expect(page.getByRole("button",{name:"登录",exact:true})).toHaveCSS("background-color","rgb(196, 9, 99)");
  await page.getByRole("button",{name:"禁用操作"}).hover({force:true});
  await expect(page.getByRole("button",{name:"禁用操作"})).toHaveCSS("background-color","rgb(250, 250, 250)");
});

test("calendar dates outside the current month remain readable and selectable",async({page})=>{
  const css=["base","controls","date-field"].map(f=>readFileSync(`src/styles/${f}.css`,"utf8")).join("\n");
  await page.setContent(`<style>${css}</style><div class="date-grid"><button class="outside">30</button><button class="selected">1</button></div>`);
  await expect(page.getByRole("button",{name:"30",exact:true})).toHaveCSS("color","rgb(150, 155, 164)");
  await expect(page.getByRole("button",{name:"30",exact:true})).toBeEnabled();
  await expect(page.getByRole("button",{name:"1",exact:true})).toHaveCSS("color","rgb(16, 17, 19)");
});
