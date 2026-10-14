import { Application, Assets, ColorMatrixFilter, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import './style.css';

type Kind = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
type Side = 'w' | 'b';
const frames: Record<string, [number, number, number, number]> = {
  wp:[765,251,140,209], wn:[914,209,163,251], wb:[1089,187,148,273],
  wr:[1250,205,162,255], wq:[1424,149,145,311], wk:[1582,95,161,366],
  bp:[761,594,141,214], bn:[910,544,166,264], bb:[1089,530,145,278],
  br:[1249,550,163,258], bq:[1425,501,147,307], bk:[1586,467,158,341],
};

async function main() {
  const host = document.querySelector<HTMLDivElement>('#board')!;
  const app = new Application();
  await app.init({backgroundAlpha:0, antialias:false, resolution:window.devicePixelRatio || 1, autoDensity:true, autoStart:false, preference:'webgl'});
  host.appendChild(app.canvas);
  const atlas = await Assets.load<Texture>(`${import.meta.env.BASE_URL}retro-chess-assets.png`);
  atlas.source.scaleMode = 'nearest';
  const crop = (r:[number,number,number,number]) => new Texture({source:atlas.source,frame:new Rectangle(...r)});
  const scene = new Container({label:'board'});
  app.stage.addChild(scene);

  // The original decorative frame surrounds the reconstructed, evenly spaced tiles.
  const frame = new Sprite(crop([25,81,716,724]));
  frame.width=720; frame.height=720;
  scene.addChild(frame);
  const inset=18, square=85.5;
  // Sample clean interiors of the supplied tiles, retaining their baked-in scanlines.
  const light=crop([45,103,75,78]), dark=crop([128,103,76,78]);
  for(let row=0;row<8;row++) for(let col=0;col<8;col++) {
    const tile=new Sprite((row+col)%2===0 ? dark : light);
    tile.position.set(inset+col*square,inset+row*square);
    tile.width=square; tile.height=square;
    scene.addChild(tile);
  }
  const highlight=new Graphics({label:'square-highlight'});
  scene.addChild(highlight);
  const pieceLayer=new Container({label:'pieces',sortableChildren:true});
  scene.addChild(pieceLayer);
  // Give each silhouette a useful tile-sized presence, rather than shrinking
  // every piece to accommodate the unusually tall king in the source sheet.
  const heights:Record<Kind,number>={p:1.00,r:1.05,n:1.10,b:1.12,q:1.17,k:1.22};
  const pieces:{id:string;square:string;kind:Kind;side:Side}[]=[];
  type Pose={y:number;xScale:number;yScale:number};
  type Keyframe=Pose & {at:number};
  type Actor={id:string;row:number;col:number;root:Container;visual:Container;sprite:Sprite;shadow:Graphics;filter:ColorMatrixFilter;brightness:number;pose:Pose;animation?:{start:number;keys:Keyframe[]}};
  const actors:Actor[]=[];
  function place(side:Side,kind:Kind,col:number,row:number) {
    const id=`${side}-${kind}-${col}-${row}`;
    const root=new Container({label:id});
    root.position.set(inset+(col+0.5)*square,inset+(row+0.82)*square);
    root.zIndex=row*8+col;
    const visual=new Container({label:'visual'});
    const sprite=new Sprite(crop(frames[side+kind]));
    sprite.anchor.set(0.5,1);
    sprite.scale.set(square*heights[kind]/sprite.texture.height);
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
    actors.push({id,row,col,root,visual,sprite,shadow,filter,brightness:1,pose:{y:0,xScale:1,yScale:1}});
    pieces.push({id,square:`${'abcdefgh'[col]}${8-row}`,kind,side});
  }
  const back:Kind[]=['r','n','b','q','k','b','n','r'];
  for(let col=0;col<8;col++) {
    place('b',back[col],col,0); place('b','p',col,1);
    place('w','p',col,6); place('w',back[col],col,7);
  }
  // Visible silhouettes take priority where pieces overlap; the rest of each
  // occupied square is also interactive. Neither target moves during animation.
  const image=new Image(); image.src=`${import.meta.env.BASE_URL}retro-chess-assets.png`;
  await image.decode();
  const mask=document.createElement('canvas');mask.width=image.width;mask.height=image.height;
  const ctx=mask.getContext('2d',{willReadFrequently:true})!;
  ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,image.width,image.height).data;
  let hovered:Actor|undefined, held:Actor|undefined, pointerId:number|undefined;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const rest:Pose={y:0,xScale:1,yScale:1};
  function animate(actor:Actor,keys:Keyframe[]) {
    if(reduced.matches){actor.pose={...keys[keys.length-1]};actor.animation=undefined;return;}
    actor.animation={start:performance.now(),keys:[{...actor.pose,at:0},...keys]};
  }
  function hit(event:PointerEvent) {
    const rect=app.canvas.getBoundingClientRect();
    const x=((event.clientX-rect.left)*app.screen.width/rect.width-scene.x)/scene.scale.x;
    const y=((event.clientY-rect.top)*app.screen.height/rect.height-scene.y)/scene.scale.y;
    for(const actor of [...actors].sort((a,b)=>b.root.zIndex-a.root.zIndex)) {
      const f=actor.sprite.texture.frame, s=actor.sprite.scale.x;
      const px=Math.floor((x-actor.root.x)/s+f.width/2);
      const py=Math.floor((y-actor.root.y)/s+f.height);
      if(px>=0&&py>=0&&px<f.width&&py<f.height&&pixels[((f.y+py)*image.width+f.x+px)*4+3]>50)return actor;
    }
    const col=Math.floor((x-inset)/square),row=Math.floor((y-inset)/square);
    if(col>=0&&col<8&&row>=0&&row<8)return actors.find(actor=>actor.col===col&&actor.row===row);
  }
  function feedback() {
    const active=held??hovered;
    highlight.clear();
    if(active)highlight.rect(inset+active.col*square+2,inset+active.row*square+2,square-4,square-4)
      .fill({color:0xeacb83,alpha:held?0.22:0.13}).stroke({color:0xf7df9b,width:2,alpha:0.85});
    app.canvas.style.cursor=held?'grabbing':hovered?'grab':'default';
  }
  app.canvas.style.touchAction='none';
  app.canvas.addEventListener('pointermove',event=>{
    if(pointerId!==undefined)return;
    hovered=event.pointerType==='touch'?undefined:hit(event);feedback();
  });
  app.canvas.addEventListener('pointerleave',()=>{if(!held){hovered=undefined;feedback();}});
  app.canvas.addEventListener('pointerdown',event=>{
    if(pointerId!==undefined||event.button!==0||!event.isPrimary)return;
    const actor=hit(event);if(!actor)return;
    event.preventDefault();pointerId=event.pointerId;held=actor;hovered=actor;
    app.canvas.setPointerCapture(event.pointerId);
    actor.root.zIndex=1000;
    animate(actor,[{at:45,y:0,xScale:1.07,yScale:0.93},{at:165,y:-square*0.15,xScale:0.98,yScale:1.04}]);
    feedback();
  });
  function release(event?:PointerEvent) {
    if(pointerId===undefined||(event&&event.pointerId!==pointerId))return;
    const oldId=pointerId,actor=held!;
    held=undefined;pointerId=undefined;
    animate(actor,[{at:80,...rest},{at:130,y:0,xScale:1.07,yScale:0.94},{at:250,...rest}]);
    hovered=event?.type==='pointerup'&&event.pointerType!=='touch'?hit(event):undefined;
    if(app.canvas.hasPointerCapture(oldId))app.canvas.releasePointerCapture(oldId);
    feedback();
  }
  app.canvas.addEventListener('pointerup',release);
  app.canvas.addEventListener('pointercancel',release);
  app.canvas.addEventListener('lostpointercapture',release);
  window.addEventListener('blur',()=>{release();hovered=undefined;feedback();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){release();hovered=undefined;feedback();}});
  app.ticker.add(ticker=>{
    const now=performance.now();
    for(const actor of actors){
      const animation=actor.animation;
      if(animation){
        const elapsed=now-animation.start, keys=animation.keys;
        const next=keys.findIndex(k=>k.at>elapsed);
        if(next<0){actor.pose={...keys[keys.length-1]};actor.animation=undefined;}
        else {const a=keys[next-1],b=keys[next];const t=(elapsed-a.at)/(b.at-a.at),ease=t*t*(3-2*t);
          actor.pose={y:a.y+(b.y-a.y)*ease,xScale:a.xScale+(b.xScale-a.xScale)*ease,yScale:a.yScale+(b.yScale-a.yScale)*ease};}
      }
      const {y,xScale,yScale}=actor.pose;
      actor.visual.y=y;actor.visual.scale.set(xScale,yScale);
      const lift=Math.max(0,-y/(square*.15));
      actor.shadow.scale.set(1+lift*.18,1+lift*.08);actor.shadow.alpha=1-lift*.3;
      if(actor!==held&&!actor.animation)actor.root.zIndex=actor.row*8+actor.col;
      const target=(held??hovered)===actor?1.22:1;
      actor.brightness+=(target-actor.brightness)*(1-Math.exp(-ticker.deltaMS/65));
      actor.filter.brightness(actor.brightness,false);
    }
  });
  app.start();
  function resize() {
    const size=Math.max(1,host.clientWidth);
    app.renderer.resize(size,size);
    // Room above the frame lets the top rank overlap without canvas clipping.
    const scale=size/800;
    scene.scale.set(scale);
    scene.position.set(40*scale,40*scale);
    app.render();
  }
  new ResizeObserver(resize).observe(host);
  resize();
  // Read-only diagnostics for validating the static scene.
  Object.assign(window,{boardDebug:{pieces,frames,pieceCount:pieceLayer.children.length,
    snapshot:()=>({hovered:hovered?.id,held:held?.id,actors:actors.map(a=>({id:a.id,y:a.visual.y,scaleX:a.visual.scale.x,scaleY:a.visual.scale.y,shadowY:a.shadow.y,shadowAlpha:a.shadow.alpha,
      x:scene.x+a.root.x*scene.scale.x,baseY:scene.y+a.root.y*scene.scale.y,height:a.sprite.height*scene.scale.y}))})}});
  host.dataset.ready='true';
}
main().catch(error=>{
  console.error(error);
  const message=document.querySelector<HTMLParagraphElement>('#error')!;
  message.hidden=false;message.textContent='The board could not load. Please refresh and try again.';
});
