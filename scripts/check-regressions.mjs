import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { chromium, webkit } from "@playwright/test";

const root = resolve(process.env.REGRESSION_WEB_ROOT || process.cwd());
const hooks = `
window.regressionQA = {
  snapshot:()=>({state, coins, best, progress, timeLeft, selected, dragging:!!touchStart,
    nativeAppInactive, frames:gameFrameRequest, bgmWanted, practiceMode,
    eventState:ohsunManager.state, characters:ohsunCharacterImages.length,
    gaugeHidden:ohsunGaugeView?.root.hidden}),
  start(practice=false){
    document.getElementById("title").classList.add("hidden");
    document.getElementById("hud").style.display="";
    if(practice) startPractice(); else startLevel();
  },
  pointer(type, options={}){
    const {outside=false,...rest}=options;
    (outside ? window : cv).dispatchEvent(new PointerEvent(type, {
      bubbles:true, isPrimary:true, pointerId:1, button:0,
      clientX:bx+cs*2.5,clientY:by+cs*2.5,...rest
    }));
  },
  drag(){cv.dispatchEvent(new PointerEvent("pointermove",{
    pointerId:1,clientX:bx+cs*3.5,clientY:by+cs*2.5
  }));},
  pause:pauseGame, resume:resumeGame, title:returnToTitle,
  stopMusic:pauseBgm,
  finish(){score=target; stageClear();},
  next(){document.getElementById("btn-next").click();},
  boost(){coins=1000;openIngameShop();buyIngame("time");closeIngameShop();},
  practiceMove(){const [a,b]=PRACTICE_SWAPS[practiceStep];trySwap(...a,...b);},
  practiceStep:()=>practiceStep,
  assets:()=>charaImgs.every(imgReady)
};
`;
const server = createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,"http://localhost").pathname);
    const path = resolve(root,"."+(pathname==="/"?"/index.html":pathname));
    if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
    let body = await readFile(path);
    if(path===resolve(root,"index.html")){
      const html = body.toString(), end = html.lastIndexOf("</script>");
      body = html.slice(0,end)+hooks+html.slice(end);
    }
    res.setHeader("Content-Type",({".html":"text/html; charset=utf-8",".js":"text/javascript",
      ".css":"text/css",".png":"image/png",".mp3":"audio/mpeg",".wav":"audio/wav",".ttf":"font/ttf"})[extname(path).toLowerCase()]||"application/octet-stream");
    res.end(body);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  for(const [name,engine] of Object.entries({chromium,webkit})){
    const browser = await engine.launch();
    try {
      for(const storageMode of ["normal","blocked","corrupt"]){
        const page = await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
        const errors=[],missing=[];
        page.on("pageerror",e=>errors.push(e.message));
        page.on("response",r=>{if(r.status()===404)missing.push(r.url());});
        let release;
        const imageGate = new Promise(resolve=>{release=resolve;});
        await page.route("**/*",async route=>{
          if(!route.request().url().startsWith(origin)){await route.abort();return;}
          if(route.request().resourceType()==="image" && route.request().url().includes("/collaborations/ohsun/")) await imageGate;
          await route.continue();
        });
        await page.addInitScript(mode=>{
          const OriginalDate=Date;
          window.Date=class extends OriginalDate {
            constructor(...args){super(...(args.length?args:["2026-09-16T12:00:00+09:00"]));}
            static now(){return new OriginalDate("2026-09-16T12:00:00+09:00").getTime();}
          };
          localStorage.setItem("ohanapon-muted","1");
          localStorage.setItem("ohanapon-login-last","2026-09-16");
          localStorage.setItem("airis-privacy-choice","declined");
          if(mode==="corrupt") for(const key of ["coins","best","progress","login-streak","fullpromo-idx"])
            localStorage.setItem("ohanapon-"+key,"NaN");
          if(mode==="blocked") Object.defineProperty(window,"localStorage",{get(){throw new DOMException("blocked","SecurityError");}});
          window.Capacitor={isNativePlatform:()=>true,Plugins:{App:{addListener(_,fn){
            window.nativeLifecycle=fn;return {remove:async()=>{}};
          }}}};
        },storageMode);
        await page.goto(origin,{waitUntil:"domcontentloaded"});
        await page.waitForFunction(()=>!!window.regressionQA);
        await page.evaluate(()=>regressionQA.start(true));
        release();
        await page.waitForFunction(()=>regressionQA.snapshot().characters===7 && regressionQA.assets());
        let snapshot = await page.evaluate(()=>regressionQA.snapshot());
        assert.equal(snapshot.eventState,"DISABLED","late assets must not enable collaboration during tutorial");
        assert.equal(snapshot.gaugeHidden,true);
        for(const field of ["coins","best","progress"]) assert.ok(Number.isFinite(snapshot[field]),field);
        if(storageMode==="normal"){
          for(const step of [1,2,3]){
            await page.waitForFunction(step=>regressionQA.practiceStep()===step && regressionQA.snapshot().state==="idle",step);
            await page.evaluate(()=>regressionQA.practiceMove());
          }
          await page.waitForFunction(()=>regressionQA.snapshot().state==="practiceDone" && !regressionQA.snapshot().practiceMode);
        }
        await page.evaluate(()=>regressionQA.start());
        await page.evaluate(()=>regressionQA.pointer("pointerdown"));
        assert.equal((await page.evaluate(()=>regressionQA.snapshot())).dragging,true);
        await page.evaluate(()=>{regressionQA.pointer("pointercancel");regressionQA.drag();});
        assert.equal((await page.evaluate(()=>regressionQA.snapshot())).state,"idle");
        await page.evaluate(()=>{
          regressionQA.pointer("pointerdown");
          regressionQA.pointer("pointerup",{outside:true});
          regressionQA.drag();
        });
        assert.equal((await page.evaluate(()=>regressionQA.snapshot())).state,"idle");
        await page.evaluate(()=>{regressionQA.pointer("pointerdown");regressionQA.start();});
        snapshot=await page.evaluate(()=>regressionQA.snapshot());
        assert.equal(snapshot.selected,null);
        assert.equal(snapshot.dragging,false);
        await page.evaluate(()=>nativeLifecycle({isActive:false}));
        snapshot=await page.evaluate(()=>regressionQA.snapshot());
        await page.waitForTimeout(200);
        assert.equal((await page.evaluate(()=>regressionQA.snapshot())).timeLeft,snapshot.timeLeft);
        assert.equal(snapshot.frames,0);
        await page.evaluate(()=>nativeLifecycle({isActive:true}));
        await page.waitForFunction(()=>regressionQA.snapshot().frames!==0);
        await page.evaluate(()=>regressionQA.pause());
        assert.equal((await page.evaluate(()=>regressionQA.snapshot())).state,"paused");
        await page.evaluate(()=>regressionQA.resume());
        await page.evaluate(()=>regressionQA.boost());
        snapshot=await page.evaluate(()=>regressionQA.snapshot());
        assert.equal(snapshot.coins,700);
        assert.ok(snapshot.timeLeft>70);
        await page.evaluate(()=>regressionQA.finish());
        await page.locator("#clear").waitFor({state:"visible"});
        await page.evaluate(()=>{regressionQA.stopMusic();regressionQA.next();});
        assert.equal((await page.evaluate(()=>regressionQA.snapshot())).bgmWanted,true);
        await page.evaluate(()=>regressionQA.title());
        assert.equal((await page.evaluate(()=>regressionQA.snapshot())).state,"title");
        assert.deepEqual(errors,[]);
        assert.deepEqual(missing,[]);
        console.log(`${name} / ${storageMode}: startup, tutorial, input, lifecycle, shop, next stage OK`);
        await page.close();
      }
    }finally{await browser.close();}
  }
}finally{server.close();}
