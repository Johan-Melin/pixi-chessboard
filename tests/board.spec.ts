import { test, expect, type Page } from '@playwright/test';

async function ready(page:Page) {
  await page.goto('/');
  await page.locator('#board[data-ready]').waitFor();
}
async function cell(page:Page, square:string, fx=.5, fy=.5) {
  const rect=(await page.locator('#board canvas').boundingBox())!;
  const scale=rect.width/800;
  return {x:rect.x+(40+18+(square.charCodeAt(0)-97+fx)*85.5)*scale,
    y:rect.y+(40+18+(8-Number(square[1])+fy)*85.5)*scale};
}
async function drag(page:Page,from:string,to:string) {
  const a=await cell(page,from,.04,.4),b=await cell(page,to);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.waitForTimeout(190);
  await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();
}
async function position(page:Page) { return page.evaluate(()=>(window as any).playground.board.getPosition()); }
async function fixture(page:Page, mode:string) {
  await page.evaluate(async mode=>{
    const w=window as any, api=w.playground;
    api.board.destroy();w.requests=[];w.errors=[];
    w.fixturePosition=[{id:'a',square:'d2',kind:'p',side:'w'},{id:'b',square:'d7',kind:'p',side:'b'}];
    api.board=await api.createChessboard(document.querySelector('#board'),{
      assetUrl:api.assetUrl,position:w.fixturePosition,
      ...(mode==='custom'?{pieceAssets:{wp:'/assets/pawn-white.svg',bp:'/assets/pawn-black.svg'}}:{}),
      onError:(error:Error)=>w.errors.push(error.message),
      ...(mode==='readonly'?{}:{onMoveRequest:(request:any)=>{
        w.requests.push(request);
        if(mode==='reject')return null;
        if(mode==='throw')throw new Error('Host failure');
        if(mode==='invalid')return [...w.fixturePosition,w.fixturePosition[0]];
        if(mode==='pending')return new Promise(resolve=>{w.resolveRequest=resolve;});
        // This controller moves the target aside rather than capturing it.
        return w.fixturePosition.map((piece:any)=>({...piece,square:piece.id===request.pieceId?request.to:'e6'}));
      }}),
    });
  },mode);
}

test('playground keeps free movement, capture effects, and reset',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await ready(page);expect(await position(page)).toHaveLength(32);
  await drag(page,'d2','d4');expect((await position(page)).find((p:any)=>p.id==='w-p-3-6').square).toBe('d4');
  await page.waitForTimeout(450);
  await drag(page,'d4','d7');expect(await position(page)).toHaveLength(31);
  await page.waitForTimeout(230);
  await page.screenshot({path:'test-results/capture.png'});
  await page.getByRole('button',{name:'Reset board'}).click();
  expect(await position(page)).toHaveLength(32);
  await page.waitForTimeout(700);expect(await position(page)).toHaveLength(32);
  expect(errors).toEqual([]);
});

test('host may reject without changing the position or capturing',async({page})=>{
  await ready(page);await fixture(page,'reject');const original=await position(page);
  await drag(page,'d2','d7');await page.waitForTimeout(500);
  expect(await position(page)).toEqual(original);
  expect(await page.evaluate(()=>(window as any).requests)).toEqual([{pieceId:'a',from:'d2',to:'d7'}]);
  await expect(page.locator('#board canvas')).not.toHaveCSS('cursor','wait');
});

test('custom SVG artwork supports silhouette picking and survives replacement and cleanup',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await ready(page);await fixture(page,'custom');
  const r=(await page.locator('#board canvas').boundingBox())!,s=r.width/800;
  // Pawn head extends into the square above its base; click its actual artwork,
  // not the occupied-square fallback, so the replacement alpha mask is exercised.
  const x=r.x+(58+3.5*85.5)*s,y=r.y+(58+5.99*85.5)*s;
  await page.mouse.move(x,y);await page.mouse.down();await page.waitForTimeout(190);
  const target=await cell(page,'d4');await page.mouse.move(target.x,target.y,{steps:8});await page.mouse.up();
  await expect.poll(async()=>(await position(page))[0].square).toBe('d4');
  await page.evaluate(()=>{const board=(window as any).playground.board;board.setPosition([],{animate:false});board.setPosition([{id:'black',square:'e4',side:'b',kind:'p'}]);});
  await page.waitForTimeout(200);await page.screenshot({path:'test-results/custom-pawn.png'});
  await page.evaluate(()=>(window as any).playground.board.destroy());expect(errors).toEqual([]);
});

test('host controls the full result: an occupied destination need not capture',async({page})=>{
  await ready(page);await fixture(page,'relocate');await drag(page,'d2','d7');
  expect(await position(page)).toEqual([{id:'a',square:'d7',kind:'p',side:'w'},{id:'b',square:'e6',kind:'p',side:'b'}]);
});

test('one unmodified SVG supports independent fill, outline toggle, and sizing',async({page})=>{
  await ready(page);
  const output=await page.evaluate(async()=>{
    const {prepareArtwork}=await import('/src/artwork.ts');
    const image=new Image();image.src='/assets/pawn-original.svg';await image.decode();
    const rect=[0,0,192,192];
    const inspect=(style:any)=>{
      const result=prepareArtwork(image,rect,style,85.5);
      let teal=0,dark=0;
      for(let i=0;i<result.pixels.length;i+=4){
        if(result.pixels[i+3]===255&&result.pixels[i]===67&&result.pixels[i+1]===153&&result.pixels[i+2]===173)teal++;
        if(result.pixels[i+3]===255&&result.pixels[i]===18&&result.pixels[i+1]===22&&result.pixels[i+2]===28)dark++;
      }
      return {teal,dark,height:result.bounds[3]};
    };
    return {plain:inspect({color:'#4399ad',outline:false}),outlined:inspect({color:'#4399ad',outline:true,outlineWidth:2}),thick:inspect({color:'#4399ad',outline:true,outlineWidth:5}),
      invalid:[{scale:0},{color:'not-a-color'},{outline:true,outlineWidth:-1}].map(style=>{try{prepareArtwork(image,rect,style,85.5);return false;}catch{return true;}})};
  });
  expect(output.plain.teal).toBeGreaterThan(100);expect(output.plain.dark).toBe(0);
  expect(output.outlined.teal).toBeGreaterThan(100);expect(output.outlined.dark).toBeGreaterThan(0);
  expect(output.thick.height).toBeGreaterThan(output.outlined.height);expect(output.invalid).toEqual([true,true,true]);
});

test('tint preserves SVG shading, transparency, and untinted artwork',async({page})=>{
  await ready(page);
  const samples=await page.evaluate(async()=>{
    const {prepareArtwork}=await import('/src/artwork.ts');
    const image=new Image();
    image.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="10"><path fill="white" d="M0 0h10v10H0z"/><path fill="#808080" d="M10 0h10v10H10z"/></svg>');
    await image.decode();
    const sample=(color?:string)=>{
      const result=prepareArtwork(image,[0,0,30,10],{color},85.5);
      const pixel=(x:number,y:number)=>Array.from(result.pixels.slice((y*result.width+x)*4,(y*result.width+x)*4+4));
      return {light:pixel(5,5),shade:pixel(15,5),transparent:pixel(0,0)};
    };
    return {tinted:sample('#4399ad'),original:sample()};
  });
  expect(samples.tinted.light).toEqual([67,153,173,255]);
  for(let channel=0;channel<3;channel++)expect(samples.tinted.shade[channel]).toBeCloseTo(samples.tinted.light[channel]*128/255,0);
  expect(samples.tinted.shade[3]).toBe(255);
  expect(samples.tinted.transparent[3]).toBe(0);
  expect(samples.original.shade).toEqual([128,128,128,255]);
});

test('pending decisions do not mutate the board; later acceptance applies',async({page})=>{
  await ready(page);await fixture(page,'pending');await drag(page,'d2','d7');
  expect((await position(page))[0].square).toBe('d2');
  await expect(page.locator('#board canvas')).toHaveCSS('cursor','wait');
  await drag(page,'d7','e5');expect(await page.evaluate(()=>(window as any).requests.length)).toBe(1);
  await page.evaluate(()=>(window as any).resolveRequest([{id:'a',square:'d7',kind:'p',side:'w'}]));
  await expect.poll(async()=> (await position(page)).length).toBe(1);
  expect((await position(page))[0].square).toBe('d7');
});

test('external updates supersede stale async responses and copy caller data',async({page})=>{
  await ready(page);await fixture(page,'pending');await drag(page,'d2','d7');
  await page.evaluate(()=>{
    const w=window as any;const next=[{id:'new',square:'a1',kind:'r',side:'w'}];
    w.playground.board.setPosition(next,{animate:false});next[0].square='h8';
    w.playground.board.getPosition()[0].square='g8';
    w.resolveRequest([{id:'stale',square:'h8',kind:'k',side:'b'}]);
  });
  await page.waitForTimeout(200);expect(await position(page)).toEqual([{id:'new',square:'a1',kind:'r',side:'w'}]);
});

test('invalid input is rejected atomically; callback errors restore the piece',async({page})=>{
  await ready(page);await fixture(page,'invalid');const original=await position(page);
  await drag(page,'d2','d7');await page.waitForTimeout(500);expect(await position(page)).toEqual(original);
  expect(await page.evaluate(()=>(window as any).errors[0])).toContain('Duplicate');
  const results=await page.evaluate(()=>{
    const b=(window as any).playground.board;
    return [
      [{id:'x',square:'a9',kind:'p',side:'w'}],
      [{id:'x',square:'a1',kind:'p',side:'w'},{id:'y',square:'a1',kind:'p',side:'w'}],
    ].map(p=>{try{b.setPosition(p);return false;}catch{return true;}});
  });expect(results).toEqual([true,true]);expect(await position(page)).toEqual(original);
  await fixture(page,'throw');await drag(page,'d2','d7');await page.waitForTimeout(500);
  expect(await page.evaluate(()=>(window as any).errors)).toEqual(['Host failure']);
  expect(await position(page)).toEqual(original);
});

test('no callback is read-only; arbitrary supplied positions need no chess engine',async({page})=>{
  await ready(page);await fixture(page,'readonly');const original=await position(page);
  await drag(page,'d2','d7');expect(await position(page)).toEqual(original);
  await page.evaluate(()=>(window as any).playground.board.setPosition([{id:'solo',square:'h8',kind:'q',side:'b'}]));
  expect((await position(page))[0].id).toBe('solo');
});

test('destroy is idempotent, ignores pending replies, and preserves another instance',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await ready(page);await fixture(page,'pending');await drag(page,'d2','d7');
  await page.evaluate(async()=>{
    const w=window as any,api=w.playground;
    const host=document.createElement('div');host.id='second';host.style.cssText='width:300px;height:300px';document.body.append(host);
    w.second=await api.createChessboard(host,{assetUrl:api.assetUrl,position:[{id:'second',square:'e4',side:'w',kind:'k'}]});
    api.board.destroy();api.board.destroy();w.resolveRequest(null);
    window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('resize'));
    w.second.setPosition([{id:'second',square:'d5',side:'w',kind:'k'}]);
  });
  await page.waitForTimeout(400);await expect(page.locator('#board canvas')).toHaveCount(0);
  await expect(page.locator('#second canvas')).toHaveCount(1);
  expect(await page.evaluate(()=>(window as any).second.getPosition()[0].square)).toBe('d5');
  expect(errors).toEqual([]);
});

test('touch capture and reset remain functional on a narrow screen',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page=await context.newPage();await page.goto('http://127.0.0.1:5173/');await page.locator('#board[data-ready]').waitFor();
  const client=await context.newCDPSession(page),a=await cell(page,'d2',.04,.4),b=await cell(page,'d7');
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});await page.waitForTimeout(190);
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[b]});await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(async()=> (await position(page)).length).toBe(31);
  await page.getByRole('button',{name:'Reset board'}).click();expect(await position(page)).toHaveLength(32);
  await page.screenshot({path:'test-results/mobile.png'});await context.close();
});
