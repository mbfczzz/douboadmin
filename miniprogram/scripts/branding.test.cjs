const {test}=require("node:test");
const assert=require("node:assert/strict");
const {harness}=require("./harness.cjs");

for(const name of ["activate","login"]){
  test(name+" loads the project logo from OSS before login",async()=>{
    const h=harness(),page=h.page(name);
    assert.match(page.data.brandIcon,/\/api\/brand-icon$/);
    const brandIcon="https://fixture.oss-cn-shanghai.aliyuncs.com/system/brand/hash/doubo.png?x-oss-signature=fixture";
    h.api.request=async()=>({brandIcon,wechatLogin:true});
    await page.load();
    assert.equal(page.data.brandIcon,brandIcon);
    assert.equal(page.data.wechatReady,true);
    h.api.request=async()=>({wechatLogin:true});
    await page.load();
    assert.match(page.data.brandIcon,/\/api\/brand-icon$/,"older API retains local redirect fallback");
  });
}
