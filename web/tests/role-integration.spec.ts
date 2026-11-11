import {test,expect,type Page} from "@playwright/test";
import {mockLogin} from "./mock-login";

const roles=[
  ["partner","服务商"],["branch","分公司"],["s1","合作服务商"],["s2","S2 推荐官"],["custom-reader","自定义权限角色"],
].map(([id,name])=>({id,version:0,data:{name,scope:"partner",menus:["partners"]}}));

async function provider(page:Page,existing=false){
  await mockLogin(page);
  await page.route("**/api/admin/roles/labels",r=>r.fulfill({json:{branch:"区域公司",s1:"合作服务商",s2:"S2 推荐官",member:"创作会员"}}));
  await page.route(/\/api\/admin\/roles(?:\?|$)/,r=>r.fulfill({json:roles}));
  await page.route(/\/api\/admin\/partners\/tree\?/,r=>r.fulfill({json:{items:[{id:"p-s1",version:1,children:0,createdAt:"2026-11-11",data:{name:"复查服务商",role:"s1",status:"active",parentId:"root",path:["root"]}}],page:1,size:20,total:1}}));
  const account=existing?{id:"login-one",version:1,createdAt:"2026-11-11",data:{username:"custom-login",name:"负责人",role:"custom-reader",disabled:false}}:null;
  const writes:Record<string,unknown>[]=[];
  await page.route("**/api/admin/partners/p-s1/account",r=>{
    if(r.request().method()==="PUT")writes.push(r.request().postDataJSON());
    return r.fulfill({json:{account}});
  });
  await page.getByRole("button",{name:"服务商管理",exact:true}).click();
  await expect(page.getByRole("treeitem")).toContainText("合作服务商");
  await page.getByRole("button",{name:"登录账号",exact:true}).click();
  return writes;
}

test("first S1 account defaults to S1 and excludes incompatible business roles",async({page})=>{
  const writes=await provider(page);
  const dialog=page.getByRole("dialog",{name:"登录账号",exact:true});
  const select=dialog.getByRole("combobox");
  await expect(select).toBeEnabled();
  await expect(select).toHaveValue("s1");
  await expect(select.locator("option[value=branch],option[value=s2],option[value=member]")).toHaveCount(0);
  await expect(select.locator("option[value=custom-reader]")).toHaveCount(1);
  await expect(select.locator("option[value=partner]")).toHaveCount(1);
  await dialog.getByRole("button",{name:"开通账号",exact:true}).click();
  await expect.poll(()=>writes.length).toBe(1);
  expect(writes[0].role).toBe("s1");
});

test("editing a legacy custom permission role preserves that role",async({page})=>{
  await provider(page,true);
  await page.getByRole("button",{name:"修改角色",exact:true}).click();
  const select=page.getByRole("dialog",{name:"修改角色",exact:true}).getByRole("combobox");
  await expect(select).toBeEnabled();
  await expect(select).toHaveValue("custom-reader");
  await expect(select.locator("option[value=branch],option[value=s2]")).toHaveCount(0);
  await expect(select.locator("option[value=s1]")).toHaveCount(1);
});

test("approval confirmation resolves the current role name without submitting approval",async({page})=>{
  await mockLogin(page);
  await page.route("**/api/admin/roles/labels",r=>r.fulfill({json:{branch:"区域公司"}}));
  await page.route(/\/api\/admin\/partners\/tree\?/,r=>r.fulfill({json:{items:[{id:"pending-branch",version:1,children:0,data:{name:"待开通公司",role:"branch",status:"pending",parentId:"root",ownerUser:"pending-owner"}}],page:1,size:20,total:1}}));
  await page.route("**/api/admin/registrations/pending-owner",r=>{
    expect(r.request().method()).toBe("GET");
    return r.fulfill({json:{id:"pending-owner",version:3,data:{name:"登记用户",role:"branch",partnerId:"pending-branch",parentId:"root",status:"pending"}}});
  });
  await page.getByRole("button",{name:"服务商管理",exact:true}).click();
  await page.getByRole("button",{name:"开通",exact:true}).click();
  const confirm=page.getByRole("dialog");
  await expect(confirm).toContainText("登记用户");
  await expect(confirm).toContainText("区域公司角色");
  await confirm.getByRole("button",{name:"取消",exact:true}).click();
});
