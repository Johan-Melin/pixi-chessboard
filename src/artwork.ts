import type { PieceStyle } from './types.js';

type Rect = readonly [number, number, number, number];
function canvas(width:number,height:number){const result=document.createElement('canvas');result.width=width;result.height=height;return result;}

/** Styles the image's combined alpha silhouette, keeping the supplied SVG untouched. */
export function prepareArtwork(image:HTMLImageElement,rect:Rect,style:PieceStyle,targetHeight:number){
  const scale=style.scale??1;
  if(!Number.isFinite(scale)||scale<=0)throw new TypeError('Piece scale must be a positive number.');
  targetHeight*=scale;
  for(const color of [style.color,style.outlineColor])if(color!==undefined&&!CSS.supports('color',color))throw new TypeError(`Invalid piece color: ${color}`);
  const width=style.outlineWidth??2;
  if(!Number.isFinite(width)||width<0||(style.outline&&width*2>=targetHeight))throw new TypeError('Outline width must be non-negative and less than half the displayed piece height.');
  const source=canvas(rect[2],rect[3]),ctx=source.getContext('2d',{willReadFrequently:true})!;
  ctx.drawImage(image,...rect,0,0,source.width,source.height);
  const alpha=ctx.getImageData(0,0,source.width,source.height).data;
  let left=source.width,top=source.height,right=-1,bottom=-1;
  for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)if(alpha[(y*source.width+x)*4+3]>0){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  if(right<0)throw new TypeError('Piece artwork is fully transparent.');
  const w=right-left+1,h=bottom-top+1;
  // Convert board units into source pixels, accounting for the expanded silhouette.
  const radius=style.outline&&width>0?width*h/(targetHeight-2*width):0;
  const pad=Math.ceil(radius)+1;
  const fill=canvas(w,h),fillCtx=fill.getContext('2d')!;
  fillCtx.drawImage(source,left,top,w,h,0,0,w,h);
  if(style.color){fillCtx.globalCompositeOperation='source-in';fillCtx.fillStyle=style.color;fillCtx.fillRect(0,0,w,h);}
  const rendered=canvas(w+2*pad,h+2*pad),out=rendered.getContext('2d',{willReadFrequently:true})!;
  if(radius){
    // A filled silhouette is stamped around the contour; internal SVG seams
    // never gain strokes, even when the source consists of overlapping shapes.
    const silhouette=canvas(w,h),silhouetteCtx=silhouette.getContext('2d')!;
    silhouetteCtx.drawImage(source,left,top,w,h,0,0,w,h);
    silhouetteCtx.globalCompositeOperation='source-in';silhouetteCtx.fillStyle=style.outlineColor??'#12161c';silhouetteCtx.fillRect(0,0,w,h);
    for(let i=0;i<64;i++){const angle=i*Math.PI/32;out.drawImage(silhouette,pad+Math.cos(angle)*radius,pad+Math.sin(angle)*radius);}
    out.drawImage(silhouette,pad,pad);
  }
  out.drawImage(fill,pad,pad);
  return {image:rendered,pixels:out.getImageData(0,0,rendered.width,rendered.height).data,width:rendered.width,
    bounds:[1,1,w+2*(pad-1),h+2*(pad-1)] as [number,number,number,number]};
}
