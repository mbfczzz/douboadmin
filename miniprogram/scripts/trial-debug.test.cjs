const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm"),ts=require("typescript");
// The debug console slows every request and render, so it is opt-in only.
function fixture(env, stored){
  const calls=[],storage=new Map(stored===undefined?[]:[["debug-console",stored]]);
  const exports={};
  const code=ts.transpileModule(fs.readFileSync("services/trial-debug.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{exports,Promise,wx:{getAccountInfoSync:()=>({miniProgram:{envVersion:env}}),setEnableDebug(o){calls.push(o.enableDebug)},getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v)}});
  return {...exports,calls,storage};
}
test("no environment turns the debug console on by itself, and requests never wait",async()=>{
  for(const env of ["trial","release","develop",undefined]){
    const f=fixture(env);let sent=0;
    await Promise.all([f.trialDebug(async()=>++sent),f.trialDebug(async()=>++sent)]);
    assert.equal(sent,2);
    assert.deepEqual(f.calls,[]);
    assert.equal(f.debugEnabled(),false);
  }
});
test("the console is switched on and off explicitly and remembered",()=>{
  const f=fixture("trial");
  f.setDebug(true);
  assert.equal(f.debugEnabled(),true);
  f.setDebug(false);
  assert.deepEqual(f.calls,[true,false]);
  assert.equal(f.storage.get("debug-console"),false);
});
test("a console left on by earlier builds is switched off once, never again",()=>{
  // WeChat returns "" for a key that was never written.
  const g=fixture("trial");
  g.storage.set("debug-console","");
  g.clearLegacyDebug();
  assert.deepEqual(g.calls,[false]);
  assert.equal(g.storage.get("debug-console"),false);
  g.clearLegacyDebug();
  assert.deepEqual(g.calls,[false]);
  const chosen=fixture("trial",true);
  chosen.clearLegacyDebug();
  assert.deepEqual(chosen.calls,[]);
});
