const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm"),ts=require("typescript");
function fixture(env,fail=false){
  let complete,calls=0;const timers=[];
  const exports={};
  const code=ts.transpileModule(fs.readFileSync("services/trial-debug.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{exports,Promise,setTimeout(fn){timers.push(fn);return 1},clearTimeout(){},wx:{getAccountInfoSync:()=>({miniProgram:{envVersion:env}}),setEnableDebug(o){calls++;assert.equal(o.enableDebug,true);complete=o.complete;if(fail)throw Error("unsupported")}}});
  return {run:exports.trialDebug,calls:()=>calls,finish:()=>complete(),timers};
}
test("trial enables debug once and gates simultaneous initial requests",async()=>{
  const f=fixture("trial");let sent=0;
  const a=f.run(async()=>++sent),b=f.run(async()=>++sent);
  assert.equal(sent,0);assert.equal(f.calls(),1);
  f.finish();await Promise.all([a,b]);assert.equal(sent,2);
});
test("release develop and unknown environments never enable debug",async()=>{
  for(const env of ["release","develop",undefined]){
    const f=fixture(env);await f.run(async()=>true);assert.equal(f.calls(),0);
  }
});
test("debug failure or missing completion cannot hang startup",async()=>{
  const failed=fixture("trial",true);await failed.run(async()=>true);
  const stalled=fixture("trial");let sent=false;
  const pending=stalled.run(async()=>{sent=true});
  assert.equal(sent,false);stalled.timers[0]();await pending;assert.equal(sent,true);
});
