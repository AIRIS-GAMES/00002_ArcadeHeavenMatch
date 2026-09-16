import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { chromium, webkit } from "@playwright/test";

const root=resolve(process.env.MOBILE_WEB_ROOT || process.cwd());
const hooks=`
const qaRender=render;
const qaFrames=[];
const qaUpdates=[], qaIntervals=[], qaStates=new Set();
let qaLastRender=0;
let qaAudioMode="off";
const qaAudio={bgm:{bgm:0,sfx:0},sfx:{bgm:0,sfx:0},both:{bgm:0,sfx:0}};
const qaAudioErrors=[];
bgm.addEventListener("playing",()=>{if(qaAudio[qaAudioMode])qaAudio[qaAudioMode].bgm++;});
for(const pool of sfx.values())for(const element of pool){
  element.addEventListener("playing",()=>{if(qaAudioMode!=="bgm"&&qaAudio[qaAudioMode])qaAudio[qaAudioMode].sfx++;});
  const original=element.play.bind(element);
  element.play=function(){
    const result=original();
    result?.catch(error=>qaAudioErrors.push({src:element.src.slice(-14),name:error.name,message:error.message,code:element.error?.code}));
    return result;
  };
}
const qaPlaySfx=playSfx;
playSfx=function(key){if(qaAudioMode!=="bgm")qaPlaySfx(key);};
let qaCharacterDraws=0;
let qaTrigger=false;
const qaUpdate=update;
update=function(dt){const begin=performance.now();qaStates.add(state);if(qaTrigger){qaTrigger=false;ohsunManager.addCharge({matchLengths:[5,5,5,5]});beginOhsunSequence();}qaUpdate(dt);qaUpdates.push(performance.now()-begin);};
render=function(){const begin=performance.now();if(qaLastRender)qaIntervals.push(begin-qaLastRender);qaLastRender=begin;qaRender();qaFrames.push(performance.now()-begin);};
const qaDrawImage=ctx.drawImage.bind(ctx);
ctx.drawImage=function(img,...args){if(img===ohsunCharacterImg && ohsunManager.isBusy()) qaCharacterDraws++;return qaDrawImage(img,...args);};
window.mobileQA={
  ready:()=>ohsunCharacterImages.length===7 && charaImgs.every(imgReady),
  start(){document.getElementById("title").classList.add("hidden");document.getElementById("hud").style.display="";level=1;startLevel();},
  begin(){qaTrigger=true;},
  presentation(phase,progress){
    stopGameLoop();
    ohsunManager.state=phase;
    ohsunManager.elapsed=progress*(phase==="ENTERING" ? OHSUN_EVENT_CONFIG.timing.entrySeconds : OHSUN_EVENT_CONFIG.timing.exitSeconds);
    render();
  },
  clear(){score=1605;ohsunStageResult.record({piecesRemoved:14,scoreGained:300});stageClear();},
  howto(){document.getElementById("btn-howto-menu").click();},
  hud(value){score=value;target=120000;updateHUD();},
  audioReady:()=>[...sfx.values()].every(pool=>pool.every(e=>e.preload!=="auto"||e.readyState>=2)),
  audioMode(mode){stopSfx();qaAudioMode=mode;muted=false;applyMuted();if(mode==="sfx")pauseBgm();else playBgm();},
  audioMetrics:()=>qaAudio,
  audioErrors:()=>qaAudioErrors,
  move(){target=1000000;currentStageRules={...currentStageRules,scoreTarget:target};timeLeft=600;const move=findAnyMove();if(!move)return null;let [r,c,r2,c2]=move;if(r===r2&&c===c2)c2=c+1<COLS?c+1:c-1;return [[bx+(c+.5)*cs,by+(r+.5)*cs],[bx+(c2+.5)*cs,by+(r2+.5)*cs]];},
  metrics(){const p95=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length*.95)];return {render:p95(qaFrames),update:p95(qaUpdates),interval:p95(qaIntervals),states:[...qaStates],score};},
  snapshot(){return {state,viewport:{width:W,height:H},busy:ohsunManager.isBusy(),layout:getOhsunHeroLayoutCached(),draws:qaCharacterDraws,frames:qaFrames.length,canvasPixels:cv.width*cv.height,
    p95:[...qaFrames].sort((a,b)=>a-b)[Math.floor(qaFrames.length*.95)],hud:getHudRectCached(),board:{x:bx,y:by,width:cs*COLS,height:cs*ROWS}};}
};
`;
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
    const file=resolve(root,"."+(pathname==="/"?"/index.html":pathname));
    if(!file.startsWith(root+sep)) {res.writeHead(403).end();return;}
    let body=await readFile(file);
    if(file===resolve(root,"index.html")){
      const html=body.toString(); const end=html.lastIndexOf("</script>");
      body=html.slice(0,end)+hooks+html.slice(end);
    }
    res.setHeader("Content-Type",({".html":"text/html; charset=utf-8",".js":"text/javascript",".css":"text/css",".png":"image/png",".mp3":"audio/mpeg",".wav":"audio/wav",".ttf":"font/ttf"})[extname(file).toLowerCase()]??"application/octet-stream");
    res.end(body);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
await mkdir(".artifacts/mobile",{recursive:true});
let failed=false;
try{
  for(const [name,engine] of Object.entries({chromium,webkit})){
    if(process.env.MOBILE_TEST_BROWSER && process.env.MOBILE_TEST_BROWSER!==name) continue;
    const browser=await engine.launch();
    try{
      const sizes=process.env.AUDIO_GAMEPLAY_TEST || process.env.NATIVE_STARTUP_TEST ? [[390,664]] : process.env.CLEAR_SCREEN_TEST || process.env.HOWTO_SCREEN_TEST ? [[320,480],[375,560],[390,664],[390,844],[844,390],[1280,800]] : [[320,568],[390,664],[390,844],[844,390],[1280,800]];
      for(const [width,height] of sizes){
        if(process.env.MOBILE_TEST_VIEWPORT && process.env.MOBILE_TEST_VIEWPORT!==`${width}x${height}`) continue;
        const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:2,hasTouch:width<900});
        const errors=[];
        page.on("pageerror",error=>errors.push(error.message));
        await page.route("**/*",route=>route.request().url().startsWith(origin)?route.continue():route.abort());
        await page.addInitScript(()=>{
          const OriginalDate=Date;
          window.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:["2026-09-16T12:00:00+09:00"]));}static now(){return new OriginalDate("2026-09-16T12:00:00+09:00").getTime();}};
          localStorage.setItem("ohanapon-tutorial-completed","1");
          localStorage.setItem("ohanapon-muted","1");
          localStorage.setItem("airis-privacy-choice","declined");
        });
        if(process.env.NATIVE_STARTUP_TEST){
          // Match the injected bridge: no core registerPlugin, synchronous handle.
          await page.addInitScript(()=>{
            window.Capacitor={isNativePlatform:()=>true,Plugins:{App:{
              addListener:()=>({remove:async()=>{}})
            }}};
          });
        }
        await page.goto(origin);
        if(process.env.NATIVE_STARTUP_TEST){
          await page.waitForFunction(()=>document.getElementById("title").classList.contains("show-menu"));
          assert.deepEqual(errors,[],"native startup must reach the menu without exceptions");
        }
        await page.waitForFunction(()=>window.mobileQA?.ready());
        await page.evaluate(()=>mobileQA.start());
        if(process.env.GAMEPLAY_TEST || process.env.AUDIO_GAMEPLAY_TEST){
          if(process.env.AUDIO_GAMEPLAY_TEST)await page.waitForFunction(()=>mobileQA.audioReady());
          for(let turn=0;turn<9;turn++){
            await page.waitForFunction(()=>mobileQA.snapshot().state==="idle",{},{timeout:30000}).catch(async error=>{console.error({errors,snapshot:await page.evaluate(()=>mobileQA.snapshot())});throw error;});
            if(process.env.AUDIO_GAMEPLAY_TEST && turn%3===0)await page.evaluate(mode=>mobileQA.audioMode(mode),["bgm","sfx","both"][turn/3]);
            const move=await page.evaluate(()=>mobileQA.move());
            assert.ok(move,"board must have a legal move");
            await page.mouse.move(...move[0]);await page.mouse.down();
            await page.mouse.move(...move[1],{steps:4});await page.mouse.up();
            await page.waitForFunction(()=>mobileQA.snapshot().state==="idle",{},{timeout:30000}).catch(async error=>{console.error({errors,snapshot:await page.evaluate(()=>mobileQA.snapshot())});throw error;});
          }
          const metrics=await page.evaluate(()=>mobileQA.metrics());
          assert.ok(metrics.score>0);
          for(const state of ["swap","clear","fall"])assert.ok(metrics.states.includes(state));
          assert.deepEqual(errors,[]);
          if(process.env.AUDIO_GAMEPLAY_TEST){
            const audio=await page.evaluate(()=>mobileQA.audioMetrics());
            console.log(JSON.stringify({name,audio,audioErrors:await page.evaluate(()=>mobileQA.audioErrors())}));
            assert.ok(audio.bgm.bgm>0 && audio.bgm.sfx===0);
            assert.ok(audio.sfx.sfx>0 && audio.sfx.bgm===0);
            assert.ok(audio.both.sfx>0 && audio.both.bgm>0);
            // AbortError just means a restart interrupted the previous play(), which is the
            // designed fallback when both pooled voices for a key are still sounding.
            const failures=await page.evaluate(()=>mobileQA.audioErrors().filter(error=>error.name!=="AbortError"));
            assert.deepEqual(failures,[],"SE playback must not silently fail");
          }
          await page.screenshot({path:`.artifacts/mobile/${name}-gameplay-${width}x${height}.png`});
          console.log(JSON.stringify({name,width,height,metrics}));
          await page.close();continue;
        }
        if(process.env.HUD_SCREEN_TEST){
          for(const value of [0,1605,999999]){
            await page.evaluate(value=>mobileQA.hud(value),value);
            const overflow=await page.evaluate(()=>{
              const errors=[];
              for(const stat of document.querySelectorAll("#hud .stat")){
                const box=stat.getBoundingClientRect();
                if(box.left<0 || box.right>innerWidth) errors.push("stat outside viewport");
                for(const el of stat.querySelectorAll(".val,.label")){
                  const range=document.createRange();range.selectNodeContents(el);
                  for(const r of range.getClientRects()) if(r.left<box.left || r.right>box.right+.5 || r.bottom>box.bottom+.5) errors.push(el.id||el.className);
                }
              }
              return errors;
            });
            assert.deepEqual(overflow,[],`${name} ${width}x${height}, score ${value}`);
          }
          await page.screenshot({path:`.artifacts/mobile/${name}-hud-${width}x${height}.png`});
          console.log(`${name} HUD ${width}x${height}: all labels and values fit`);
          await page.close();continue;
        }
        if(process.env.HOWTO_SCREEN_TEST){
          await page.evaluate(()=>mobileQA.howto());
          await page.locator("#howto-guide").waitFor({state:"visible"});
          const overflow=await page.evaluate(()=>{
            const card=document.querySelector("#howto-guide .howto-card");
            const bounds=card.getBoundingClientRect();
            const errors=[];
            for(const el of document.querySelectorAll("#howto-guide, #howto-guide .howto-guide-panel, #howto-guide-content, #howto-guide .howto-text, #howto-guide .howto-special-row span")){
              if(el.scrollWidth>el.clientWidth+1) errors.push(el.className+": horizontal scroll");
            }
            for(const el of card.querySelectorAll(".howto-text, .howto-special-row span")){
              const range=document.createRange();range.selectNodeContents(el);
              for(const rect of range.getClientRects()) if(rect.left<bounds.left || rect.right>bounds.right) errors.push("text outside card");
            }
            return errors;
          });
          assert.deepEqual(overflow,[]);
          await page.screenshot({path:`.artifacts/mobile/${name}-howto-${width}x${height}.png`});
          await page.locator("#btn-howto-close").click();
          await page.locator("#howto-guide").waitFor({state:"hidden"});
          assert.deepEqual(errors,[]);
          console.log(`${name} howto ${width}x${height}: text fits and close button works`);
          await page.close();continue;
        }
        if(process.env.CLEAR_SCREEN_TEST){
          await page.evaluate(()=>mobileQA.clear());
          await page.waitForFunction(()=>!document.getElementById("clear").classList.contains("hidden") && document.getElementById("clear-coin").textContent==="+160");
          const layout=await page.evaluate(()=>{
            const selectors=["#clear","#clear .panel","#clear-score","#clear .coin-row","#btn-next","#btn-clear-title"];
            return selectors.map(selector=>{
              const el=document.querySelector(selector), r=el.getBoundingClientRect();
              return {selector,x:r.x,y:r.y,right:r.right,bottom:r.bottom,scroll:el.scrollHeight-el.clientHeight};
            });
          });
          for(const box of layout){
            assert.ok(box.x>=0 && box.y>=0 && box.right<=width+.5 && box.bottom<=height+.5,JSON.stringify(box));
            assert.ok(box.scroll<=1,JSON.stringify(box));
          }
          assert.equal(await page.locator("#clear .result-stat, #clear .ohsun-result-summary, #clear-mission, #clear-coin-total").count(),0);
          await page.screenshot({path:`.artifacts/mobile/${name}-clear-${width}x${height}.png`});
          await page.locator("#btn-next").click();
          await page.waitForFunction(()=>document.getElementById("clear").classList.contains("hidden") && document.getElementById("hud-level").textContent==="2");
          assert.deepEqual(errors,[]);
          console.log(`${name} clear ${width}x${height}: no scrolling, reward and next-stage button OK`);
          await page.close();
          continue;
        }
        await page.waitForTimeout(500);
        try{await page.evaluate(()=>mobileQA.begin());}catch(error){errors.push(error.message);}
        await page.waitForFunction(()=>mobileQA.snapshot().draws>0,{},{timeout:5000}).catch(error=>errors.push(error.message));
        if(process.env.OHSUN_PRESENTATION_TEST){
          for(const phase of ["ENTERING","EXITING"]){
            await page.evaluate(phase=>mobileQA.presentation(phase,.65),phase);
            await page.screenshot({path:`.artifacts/mobile/${name}-${width}x${height}-${phase}.png`});
          }
          assert.deepEqual(errors,[]);
          await page.close();
          continue;
        }
        const active=await page.evaluate(()=>mobileQA.snapshot());
        await page.screenshot({path:`.artifacts/mobile/${name}-${width}x${height}.png`});
        if(width===844){
          await page.setViewportSize({width:320,height:568});
          await page.waitForFunction(()=>{
            const snapshot=mobileQA.snapshot();
            return snapshot.viewport.width===320 && snapshot.viewport.height===568 && snapshot.layout?.character.height>=140;
          });
          const rotated=await page.evaluate(()=>mobileQA.snapshot());
          assert.ok(rotated.layout.character.x+rotated.layout.character.width<=320);
          await page.screenshot({path:`.artifacts/mobile/${name}-rotated.png`});
        }
        await page.waitForFunction(()=>!mobileQA.snapshot().busy,{},{timeout:15000}).catch(error=>errors.push(error.message));
        await page.waitForTimeout(500);
        const finished=await page.evaluate(()=>mobileQA.snapshot());
        const result={browser:name,width,height,errors,active,finished};
        console.log(JSON.stringify(result));
        try{
          assert.deepEqual(errors,[]);
          assert.ok(active.draws>0,"character must render during appearance");
          assert.ok(active.layout?.character.width>0);
          assert.ok(active.canvasPixels<=1500000,"canvas pixel budget must be bounded");
          const character=active.layout.character;
          assert.ok(character.x>=0 && character.y>=0 && character.x+character.width<=width && character.y+character.height<=height);
          assert.ok(character.width>=100 && character.height>=100,"mobile character must be visible at a useful size");
          assert.ok(!finished.busy,"event must finish");
          assert.ok(finished.board.y>=finished.hud.bottom,"board must remain below HUD after its content changes");
          assert.ok(finished.frames>active.frames+10,"game loop must continue");
        }catch(error){console.error(error.message);failed=true;}
        await page.close();
      }
    }finally{await browser.close();}
  }
}finally{server.close();}
if(failed) process.exitCode=1;
