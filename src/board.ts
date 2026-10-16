import { Application, ColorMatrixFilter, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { copyPosition } from './position.js';
import type { BoardOptions, Chessboard, BoardPiece, Position, Square } from './types.js';
import { BoardEffects } from './effects.js';
import { prepareArtwork } from './artwork.js';
import type { PieceKey } from './types.js';

type Kind = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
const square=85.5;
const heights:Record<Kind,number>={p:1.00,r:1.05,n:1.10,b:1.12,q:1.17,k:1.22};
const frames: Record<string, [number, number, number, number]> = {
  wp:[765,251,140,209], wn:[914,209,163,251], wb:[1089,187,148,273],
  wr:[1250,205,162,255], wq:[1424,149,145,311], wk:[1582,95,161,366],
  bp:[761,594,141,214], bn:[910,544,166,264], bb:[1089,530,145,278],
  br:[1249,550,163,258], bq:[1425,501,147,307], bk:[1586,467,158,341],
};

export async function createChessboard(host: HTMLElement, options: BoardOptions): Promise<Chessboard> {
  let position=copyPosition(options.position??[]);
  const light=options.boardColors?.light??'#f4dfb0';
  const dark=options.boardColors?.dark??'#a85e65';
  for(const color of [light,dark])if(!CSS.supports('color',color))throw new TypeError(`Invalid board color: ${color}`);
  // Own the image and source per instance; destroying one board cannot break another.
  const image=new Image(); image.crossOrigin='anonymous'; image.src=options.assetUrl;
  await image.decode();
  if(image.width<1750||image.height<810)throw new Error('Asset sheet is smaller than the required retro sprite layout.');
  const mask=document.createElement('canvas');mask.width=image.width;mask.height=image.height;
  const ctx=mask.getContext('2d',{willReadFrequently:true})!;
  ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,image.width,image.height).data;
  // Decode before mounting, so invalid custom artwork cannot leave a partial board.
  const artworkKeys=new Set([...Object.keys(options.pieceAssets??{}),...Object.keys(options.pieceStyles??{})]);
  const customImages=await Promise.all([...artworkKeys].map(async key=>{
    if(!Object.hasOwn(frames,key))throw new TypeError(`Unknown piece artwork key: ${key}`);
    const url=options.pieceAssets?.[key as PieceKey];
    let custom=image;
    if(url){custom=new Image();custom.crossOrigin='anonymous';custom.src=url;await custom.decode();}
    const rect=url?[0,0,custom.naturalWidth,custom.naturalHeight] as const:frames[key];
    return {key,...prepareArtwork(custom,rect,options.pieceStyles?.[key as PieceKey]??{},square*heights[key[1] as Kind])};
  }));
  const app=new Application();
  await app.init({backgroundAlpha:0,antialias:false,resolution:window.devicePixelRatio||1,autoDensity:true,autoStart:false,preference:'webgl'});
  const atlas=Texture.from(image);
  atlas.source.scaleMode='nearest';
  const ownedTextures:Texture[]=[];
  const crop=(r:[number,number,number,number])=>{
    const texture=new Texture({source:atlas.source,frame:new Rectangle(...r)});
    ownedTextures.push(texture);return texture;
  };
  const pieceTextures=Object.fromEntries(Object.entries(frames).map(([key,frame])=>[key,crop(frame)]));
  const hitMasks=Object.fromEntries(Object.entries(frames).map(([key,f])=>[key,{pixels,width:image.width,x:f[0],y:f[1]}]));
  const customSources:Texture[]=[];
  for(const custom of customImages){
    const source=Texture.from(custom.image);source.source.scaleMode='linear';customSources.push(source);
    const texture=new Texture({source:source.source,frame:new Rectangle(...custom.bounds)});ownedTextures.push(texture);
    pieceTextures[custom.key]=texture;
    hitMasks[custom.key]={pixels:custom.pixels,width:custom.width,x:custom.bounds[0],y:custom.bounds[1]};
  }
  host.appendChild(app.canvas);
  Object.assign(app.canvas.style,{display:'block',width:'100%',height:'100%',imageRendering:'pixelated',touchAction:'none'});
  const events=new AbortController();
  const listen=(target:EventTarget,type:string,callback:(event:any)=>void)=>target.addEventListener(type,callback,{signal:events.signal});
  let destroyed=false,revision=0,pending=false;
  const scene = new Container({label:'board'});
  app.stage.addChild(scene);

  const inset=18;
  // Draw the board directly; square colors no longer depend on the asset sheet.
  const tiles=new Graphics({label:'board-tiles'});
  tiles.roundRect(0,0,720,720,5).fill(dark);
  tiles.roundRect(4,4,712,712,3).stroke({color:light,width:3,alpha:.65});
  for(let row=0;row<8;row++) for(let col=0;col<8;col++) {
    tiles.rect(inset+col*square,inset+row*square,square,square).fill((row+col)%2===0 ? light : dark);
  }
  scene.addChild(tiles);
  const highlight=new Graphics({label:'square-highlight'});
  scene.addChild(highlight);
  const pieceLayer=new Container({label:'pieces',sortableChildren:true});
  scene.addChild(pieceLayer);
  const effects=new BoardEffects();
  scene.addChild(effects.layer);
  // A fixed screen overlay stays level while pieces lift, stretch, and move.
  // It has no input handlers and never changes piece hit testing.
  const scanlines=new Graphics({label:'scanlines',eventMode:'none'});
  scanlines.visible=options.scanlines!==false;
  app.stage.addChild(scanlines);
  // Give each silhouette a useful tile-sized presence, rather than shrinking
  // every piece to accommodate the unusually tall king in the source sheet.
  type Pose={y:number;xScale:number;yScale:number};
  type Keyframe=Pose & {at:number};
  type Actor={id:string;data:BoardPiece;row:number;col:number;root:Container;visual:Container;sprite:Sprite;shadow:Graphics;filter:ColorMatrixFilter;brightness:number;pose:Pose;
    impact?:{at:number;x:number;y:number;width:number};
    stretch:number;tilt:number;velocityX:number;velocityY:number;lastMotion:number;
    travel?:{start:number;duration:number;fromX:number;fromY:number;toX:number;toY:number};
    animation?:{start:number;keys:Keyframe[]}};
  const actors:Actor[]=[];
  // Depth follows the ground position, never the visual's lift or squash.
  function updateDepth(actor:Actor){actor.root.zIndex=actor.root.y*1000+actor.root.x;}
  function place(data:BoardPiece) {
    const {id,side,kind}=data;
    const col=data.square.charCodeAt(0)-97,row=8-Number(data.square[1]);
    const root=new Container({label:id});
    root.position.set(inset+(col+0.5)*square,inset+(row+0.82)*square);
    root.zIndex=root.y*1000+root.x;
    const visual=new Container({label:'visual'});
    const sprite=new Sprite(pieceTextures[side+kind]);
    sprite.anchor.set(0.5,1);
    sprite.scale.set(square*heights[kind]*(options.pieceStyles?.[(side+kind) as PieceKey]?.scale??1)/sprite.texture.height);
    // Stepped ground shadow stays independent of the visual for future lifting.
    const radius=sprite.width*0.53;
    const shadow=new Graphics({label:'ground-shadow'});
    shadow.poly([-radius,-2,-radius*.8,-7,radius*.8,-7,radius,-2,
      radius,7,radius*.7,12,-radius*.7,12,-radius,7]).fill({color:0x10151b,alpha:0.30});
    shadow.poly([-radius*.8,-1,radius*.8,-1,radius*.8,6,
      radius*.55,9,-radius*.55,9,-radius*.8,6]).fill({color:0x10151b,alpha:0.22});
    visual.addChild(sprite); root.addChild(shadow,visual); pieceLayer.addChild(root);
    const filter=new ColorMatrixFilter();
    sprite.filters=[filter];
    const actor:Actor={id,data:{...data},row,col,root,visual,sprite,shadow,filter,brightness:1,pose:{y:0,xScale:1,yScale:1},stretch:0,tilt:0,velocityX:0,velocityY:0,lastMotion:0};
    actors.push(actor);return actor;
  }
  for(const piece of position)place(piece);
  let hovered:Actor|undefined, held:Actor|undefined, pointerId:number|undefined;
  type Cell={row:number;col:number};
  let drag:{startClientX:number;startClientY:number;offsetX:number;offsetY:number;active:boolean;candidate?:Cell}|undefined;
  const homePosition=(actor:Actor)=>({x:inset+(actor.col+.5)*square,y:inset+(actor.row+.82)*square});
  const occupant=(cell:Cell,actor:Actor)=>actors.find(other=>other!==actor&&other.row===cell.row&&other.col===cell.col);
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const rest:Pose={y:0,xScale:1,yScale:1};
  function animate(actor:Actor,keys:Keyframe[]) {
    if(reduced.matches){actor.pose={...keys[keys.length-1]};actor.animation=undefined;return;}
    actor.animation={start:performance.now(),keys:[{...actor.pose,at:0},...keys]};
  }
  function boardPoint(event:PointerEvent) {
    const rect=app.canvas.getBoundingClientRect();
    const x=((event.clientX-rect.left)*app.screen.width/rect.width-scene.x)/scene.scale.x;
    const y=((event.clientY-rect.top)*app.screen.height/rect.height-scene.y)/scene.scale.y;
    return {x,y};
  }
  function cellAt(event:PointerEvent):Cell|undefined {
    const {x,y}=boardPoint(event);
    const col=Math.floor((x-inset)/square),row=Math.floor((y-inset)/square);
    if(col>=0&&col<8&&row>=0&&row<8)return {col,row};
  }
  function hit(event:PointerEvent) {
    const {x,y}=boardPoint(event);
    for(const actor of [...actors].sort((a,b)=>b.root.zIndex-a.root.zIndex)) {
      const f=actor.sprite.texture.frame, s=actor.sprite.scale.x;
      const px=Math.floor((x-actor.root.x)/s+f.width/2);
      const py=Math.floor((y-actor.root.y)/s+f.height);
      const mask=hitMasks[actor.data.side+actor.data.kind];
      if(px>=0&&py>=0&&px<f.width&&py<f.height&&mask.pixels[((mask.y+py)*mask.width+mask.x+px)*4+3]>50)return actor;
    }
    const col=Math.floor((x-inset)/square),row=Math.floor((y-inset)/square);
    if(col>=0&&col<8&&row>=0&&row<8)return actors.find(actor=>actor.col===col&&actor.row===row);
  }
  function feedback() {
    const active=held??hovered;
    highlight.clear();
    if(active)highlight.rect(inset+active.col*square+2,inset+active.row*square+2,square-4,square-4)
      .fill({color:0xeacb83,alpha:held?0.22:0.13}).stroke({color:0xf7df9b,width:2,alpha:0.85});
    if(held&&drag?.active&&drag.candidate){
      const {row,col}=drag.candidate;
      const color=occupant(drag.candidate,held)?0xebad77:0xa8d9b0;
      highlight.rect(inset+col*square+3,inset+row*square+3,square-6,square-6)
        .fill({color,alpha:.22}).stroke({color,width:3,alpha:.95});
    }
    app.canvas.style.cursor=pending?'wait':held?'grabbing':hovered?'grab':'default';
  }
  function moveHeld(event:PointerEvent) {
    if(!held||!drag||event.pointerId!==pointerId)return;
    if(!drag.active&&Math.hypot(event.clientX-drag.startClientX,event.clientY-drag.startClientY)<6)return;
    drag.active=true;
    const p=boardPoint(event),now=performance.now();
    const x=p.x-drag.offsetX,y=p.y-drag.offsetY;
    const elapsed=Math.max(8,now-held.lastMotion);
    held.velocityX=(x-held.root.x)/elapsed;
    held.velocityY=(y-held.root.y)/elapsed;
    held.lastMotion=now;
    held.root.position.set(x,y);
    updateDepth(held);
    drag.candidate=cellAt(event);
    feedback();
  }
  listen(app.canvas,'pointermove',event=>{
    if(pointerId!==undefined){moveHeld(event);return;}
    if(pending||!options.onMoveRequest)return;
    hovered=event.pointerType==='touch'?undefined:hit(event);feedback();
  });
  listen(app.canvas,'pointerleave',()=>{if(!held){hovered=undefined;feedback();}});
  listen(app.canvas,'pointerdown',event=>{
    if(pending||!options.onMoveRequest||pointerId!==undefined||event.button!==0||!event.isPrimary)return;
    const actor=hit(event);if(!actor)return;
    event.preventDefault();pointerId=event.pointerId;held=actor;hovered=actor;
    const p=boardPoint(event);
    drag={startClientX:event.clientX,startClientY:event.clientY,offsetX:p.x-actor.root.x,offsetY:p.y-actor.root.y,active:false};
    actor.travel=undefined;actor.impact=undefined;actor.velocityX=0;actor.velocityY=0;actor.lastMotion=performance.now();
    app.canvas.setPointerCapture(event.pointerId);
    animate(actor,[{at:45,y:0,xScale:1.07,yScale:0.93},{at:165,y:-square*0.15,xScale:0.98,yScale:1.04}]);
    feedback();
  });
  function detachPointer() {
    const oldId=pointerId;
    held=undefined;pointerId=undefined;drag=undefined;hovered=undefined;
    if(oldId!==undefined&&app.canvas.hasPointerCapture(oldId))app.canvas.releasePointerCapture(oldId);
  }
  function land(actor:Actor,duration:number) {
    updateDepth(actor);
    actor.velocityX=0;actor.velocityY=0;
    const target=homePosition(actor);
    const now=performance.now(),impactAt=now+duration+80;
    if(duration&&!reduced.matches)actor.travel={start:now,duration,fromX:actor.root.x,fromY:actor.root.y,toX:target.x,toY:target.y};
    else {actor.root.position.set(target.x,target.y);actor.travel=undefined;}
    const settle:Keyframe[]=[];
    if(duration)settle.push({at:duration,...actor.pose});
    settle.push({at:duration+80,...rest},{at:duration+130,y:0,xScale:1.07,yScale:0.94},{at:duration+250,...rest});
    animate(actor,settle);
    actor.impact=!reduced.matches&&actor.pose.y<-.5?{at:impactAt,x:target.x,y:target.y,width:actor.sprite.width}:undefined;
  }
  function removeActor(actor:Actor,animated:boolean) {
    if(animated&&!reduced.matches){
      const location=homePosition(actor);
      effects.capture(actor.sprite.texture,location.x,location.y,actor.sprite.width,actor.sprite.height,performance.now()+180,
        actor.data.side==='w'?[0xfff3c7,0xdab478,0x9b7548,0x242022]:[0x777976,0x45484a,0x1c2027,0xd1b486]);
    }
    actor.filter.destroy();actor.root.destroy({children:true});
    actors.splice(actors.indexOf(actor),1);
  }
  function applyPosition(next:BoardPiece[],animated:boolean) {
    // Diff by stable ID; removed IDs are visual removals, not inferred chess rules.
    if(!animated)effects.clear();
    for(const actor of [...actors]){
      const data=next.find(piece=>piece.id===actor.id);
      if(!data||data.kind!==actor.data.kind||data.side!==actor.data.side)removeActor(actor,animated&&!data);
    }
    for(const data of next){
      let actor=actors.find(a=>a.id===data.id);
      if(!actor){place(data);continue;}
      const moved=actor.data.square!==data.square;
      actor.data={...data};actor.col=data.square.charCodeAt(0)-97;actor.row=8-Number(data.square[1]);
      actor.impact=undefined;
      if(animated){
        if(moved){actor.pose={y:-square*.15,xScale:.98,yScale:1.04};land(actor,100);}
        else if(actor.pose.y!==0||actor.travel||actor.animation)land(actor,180);
      }else{
        actor.animation=undefined;actor.travel=undefined;actor.pose={...rest};
        actor.stretch=0;actor.tilt=0;actor.velocityX=0;actor.velocityY=0;
        actor.visual.position.set(0,0);actor.visual.scale.set(1);actor.visual.rotation=0;
        actor.shadow.scale.set(1);actor.shadow.alpha=1;
        const p=homePosition(actor);actor.root.position.set(p.x,p.y);updateDepth(actor);
      }
    }
    position=next;
  }
  function report(error:unknown){
    if(options.onError){try{options.onError(error);}catch(callbackError){console.error(callbackError);}}
    else console.error('Chessboard move request failed:',error);
  }
  function release(event?:PointerEvent) {
    if(pointerId===undefined||(event&&event.pointerId!==pointerId))return;
    const actor=held!;
    if(event?.type==='pointerup')moveHeld(event);
    const wasDragging=drag?.active;
    const destination=event?.type==='pointerup'&&wasDragging?cellAt(event):undefined;
    detachPointer();
    actor.velocityX=0;actor.velocityY=0;
    if(!destination||(actor.row===destination.row&&actor.col===destination.col)){
      land(actor,wasDragging?180:0);feedback();return;
    }
    pending=true;const requestRevision=++revision;
    const request=Object.freeze({pieceId:actor.id,from:actor.data.square,to:(String.fromCharCode(97+destination.col)+(8-destination.row)) as Square});
    feedback();
    const finish=(result:Position|null)=>{
      if(destroyed||requestRevision!==revision)return;
      try {
        if(result===null){land(actor,180);}
        else applyPosition(copyPosition(result),true);
      }catch(error){land(actor,180);report(error);}
      pending=false;feedback();
    };
    try {
      const result=options.onMoveRequest!(request);
      if(result!==null&&!Array.isArray(result)){
        Promise.resolve(result).then(finish,error=>{
          if(destroyed||requestRevision!==revision)return;
          finish(null);report(error);
        });
      }else finish(result as Position|null);
    }catch(error){finish(null);report(error);}
  }
  listen(app.canvas,'pointerup',release);
  listen(app.canvas,'pointercancel',release);
  listen(app.canvas,'lostpointercapture',release);
  listen(window,'blur',()=>{release();hovered=undefined;feedback();});
  listen(document,'visibilitychange',()=>{if(document.hidden){release();hovered=undefined;feedback();}});
  app.ticker.add(ticker=>{
    const now=performance.now();
    for(const actor of actors){
      if(actor.travel){
        const travel=actor.travel,t=Math.min(1,(now-travel.start)/travel.duration),ease=1-(1-t)**3;
        actor.root.position.set(travel.fromX+(travel.toX-travel.fromX)*ease,travel.fromY+(travel.toY-travel.fromY)*ease);
        if(t===1)actor.travel=undefined;
      }
      const animation=actor.animation;
      if(animation){
        const elapsed=now-animation.start, keys=animation.keys;
        const next=keys.findIndex(k=>k.at>elapsed);
        if(next<0){actor.pose={...keys[keys.length-1]};actor.animation=undefined;}
        else {const a=keys[next-1],b=keys[next];const t=(elapsed-a.at)/(b.at-a.at),ease=t*t*(3-2*t);
          actor.pose={y:a.y+(b.y-a.y)*ease,xScale:a.xScale+(b.xScale-a.xScale)*ease,yScale:a.yScale+(b.yScale-a.yScale)*ease};}
      }
      const {y,xScale,yScale}=actor.pose;
      const moving=actor===held&&drag?.active&&!reduced.matches;
      const decay=Math.exp(-Math.max(0,now-actor.lastMotion)/70);
      const vx=moving?actor.velocityX*decay:0,vy=moving?actor.velocityY*decay:0;
      const targetStretch=Math.max(-.1,Math.min(.1,(Math.abs(vx)-Math.abs(vy))*.055));
      const smoothing=1-Math.exp(-ticker.deltaMS/55);
      actor.stretch+=(targetStretch-actor.stretch)*smoothing;
      actor.tilt+=(Math.max(-.12,Math.min(.12,vx*.06))-actor.tilt)*smoothing;
      actor.visual.y=y;actor.visual.scale.set(xScale*(1+actor.stretch),yScale*(1-actor.stretch));
      actor.visual.rotation=actor.tilt;
      const lift=Math.max(0,-y/(square*.15));
      actor.shadow.scale.set(1+lift*.18,1+lift*.08);actor.shadow.alpha=1-lift*.3;
      updateDepth(actor);
      const target=(held??hovered)===actor?1.22:1;
      actor.brightness+=(target-actor.brightness)*(1-Math.exp(-ticker.deltaMS/65));
      actor.filter.brightness(actor.brightness,false);
      if(actor.impact&&now>=actor.impact.at){
        const impact=actor.impact;actor.impact=undefined;
        if(!reduced.matches&&now-impact.at<150)effects.dust(impact.x,impact.y,impact.width,impact.at);
      }
    }
    effects.update(now,reduced.matches);
  });
  app.start();
  function resize() {
    const size=Math.max(1,host.clientWidth);
    // A changed viewport invalidates the grab offset: safely return the held piece.
    if(pointerId!==undefined&&Math.abs(size-app.screen.width)>.5)release();
    app.renderer.resize(size,size);
    // Room above the frame lets the top rank overlap without canvas clipping.
    const scale=size/800;
    scene.scale.set(scale);
    scene.position.set(40*scale,40*scale);
    scanlines.clear();
    if(options.scanlines!==false){
      for(let y=0;y<size;y+=4)scanlines.rect(0,y,size,1);
      scanlines.fill({color:0x10151b,alpha:.13});
    }
    app.render();
  }
  const observer=new ResizeObserver(resize);observer.observe(host);
  resize();
  return {
    canvas:app.canvas,
    getPosition:()=>copyPosition(position),
    setPosition(next,settings={}){
      if(destroyed)throw new Error('Chessboard has been destroyed.');
      const validated=copyPosition(next); // Validate before disturbing current state.
      revision++;pending=false;detachPointer();
      applyPosition(validated,settings.animate!==false);feedback();app.render();
    },
    destroy(){
      if(destroyed)return;
      destroyed=true;revision++;pending=false;detachPointer();
      observer.disconnect();events.abort();effects.clear();
      for(const actor of actors)actor.filter.destroy();
      app.destroy({removeView:true},{children:true});
      for(const texture of ownedTextures)texture.destroy();
      for(const texture of customSources)texture.destroy(true);
      atlas.destroy(true);
    },
  };
}
