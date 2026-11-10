import { expect, test } from "@playwright/test";
import { mockLogin } from "./mock-login";

test("templates load server pages, keep global categories and reset search", async ({page})=>{
  await mockLogin(page);
  const calls:URLSearchParams[]=[];
  await page.route("**/api/admin/models",r=>r.fulfill({json:[]}));
  await page.route("**/api/admin/templates/categories",r=>r.fulfill({json:["早期分类","其他"]}));
  await page.route("**/api/admin/templates?*",r=>{
    const q=new URL(r.request().url()).searchParams;calls.push(q);
    return r.fulfill({json:{page:Number(q.get("page")),size:12,total:521,items:[{
      id:"t"+q.get("page"),version:1,createdAt:"2026-11-10",data:{title:"模板第"+q.get("page")+"页",kind:"image",category:"其他",cover:"",published:true,sort:0},
    }]}});
  });
  await page.getByRole("button",{name:"创作模板",exact:true}).click();
  await expect(page.getByText("模板第1页",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"下一页",exact:true}).click();
  await expect(page.getByText("模板第2页",{exact:true})).toBeVisible();
  await page.getByLabel("搜索模板").fill("早期");
  await expect(page.getByText("模板第1页",{exact:true})).toBeVisible();
  expect(calls.at(-1)?.get("q")).toBe("早期");
  await page.screenshot({path:"../.runtime/pagination-catalog.png",fullPage:true});
});

test("models and feedback request subsequent pages",async({page})=>{
  await mockLogin(page);
  await page.route("**/api/admin/models?*",r=>{
    const p=Number(new URL(r.request().url()).searchParams.get("page"));
    return r.fulfill({json:{page:p,size:20,total:501,items:[{id:"model"+p,version:1,createdAt:"2026-11-10",data:{id:"model"+p,name:"模型第"+p+"页",kind:"image",key:"m",published:true,available:true,resolutions:[],ratios:[],modes:[],durations:[],settings:{}}}]}});
  });
  await page.route("**/api/admin/feedback?*",r=>{
    const p=Number(new URL(r.request().url()).searchParams.get("page"));
    return r.fulfill({json:{page:p,size:20,total:501,items:[{id:"f"+p,version:1,createdAt:"2026-11-10",data:{content:"反馈第"+p+"页"}}]}});
  });
  await page.getByRole("button",{name:"模型管理",exact:true}).click();
  await expect(page.getByText("模型第1页",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"下一页",exact:true}).click();
  await expect(page.getByText("模型第2页",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"用户反馈",exact:true}).click();
  await expect(page.getByText("反馈第1页",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"下一页",exact:true}).click();
  await expect(page.getByText("反馈第2页",{exact:true})).toBeVisible();
});

test("catalog returns to a valid page after the last page becomes empty",async({page})=>{
 await mockLogin(page);
 let total=21;
 await page.route("**/api/admin/models?*",r=>{
  const p=Number(new URL(r.request().url()).searchParams.get("page"));
  return r.fulfill({json:{page:p,size:20,total,items:p===2&&total===1?[]:[{id:"model"+p,version:1,data:{id:"model"+p,name:"保留模型第"+p+"页",kind:"image",key:"m",published:true,available:true,resolutions:[],ratios:[],modes:[],durations:[],settings:{}}}]}});
 });
 await page.getByRole("button",{name:"模型管理",exact:true}).click();
 await page.getByRole("button",{name:"下一页",exact:true}).click();
 await expect(page.getByText("保留模型第2页",{exact:true})).toBeVisible();
 total=1;
 await page.getByRole("button",{name:"刷新",exact:true}).click();
 await expect(page.getByText("保留模型第1页",{exact:true})).toBeVisible();
});
