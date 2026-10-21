// Ported from Paavai Blouse Studio (dist/edge-fit.js); logic unchanged, only turned into a module.
export const PaavaiEdgeFit={
layout(dst){
 const w=dst.maxX-dst.minX,h=dst.maxY-dst.minY;if(w<=0||h<=0)return 'straight';let tl=0,tr=0,topCenter=0,bottomCenter=0;
 for(const line of dst.lines){const x=(line[0]-dst.minX)/w,y=(line[1]-dst.minY)/h;if(y<.3){if(x<.28)tl++;else if(x>.72)tr++;else if(x>.38&&x<.62)topCenter++;}if(y>.6&&x>.32&&x<.68)bottomCenter++;}
 const n=dst.lines.length;return tl>n*.025&&tr>n*.025&&bottomCenter>n*.025&&topCenter<Math.min(tl,tr)*.20?'u':'straight';
},
rectifyDST(dst,colors){
 // Polar unwrap of a top-open U-shaped neckline. Preserve radial stitch detail.
 const cx=(dst.minX+dst.maxX)/2,cy=dst.minY,binCount=96,bins=Array.from({length:binCount},()=>[]);
 const polar=(x,y)=>{const angle=Math.atan2(Math.max(0,y-cy),x-cx);return [angle/Math.PI,Math.hypot(x-cx,y-cy)];};
 for(const line of dst.lines){const [u,r]=polar(line[0],line[1]);bins[Math.min(binCount-1,Math.floor(u*binCount))].push(r);}
 const inner=bins.map(b=>b.length?Math.min(...b.slice(0,4000)):NaN);
 for(let i=0;i<binCount;i++){if(Number.isFinite(inner[i]))continue;let left=i-1,right=i+1;while(left>=0&&!Number.isFinite(inner[left]))left--;while(right<binCount&&!Number.isFinite(inner[right]))right++;inner[i]=left>=0&&right<binCount?(inner[left]*(right-i)+inner[right]*(i-left))/(right-left):left>=0?inner[left]:right<binCount?inner[right]:0;}
 for(let round=0;round<3;round++){const next=inner.map((v,i)=>(inner[Math.max(0,i-1)]+2*v+inner[Math.min(binCount-1,i+1)])/4);inner.splice(0,inner.length,...next);}
 const baseline=u=>{const f=Math.min(binCount-1,Math.max(0,u*(binCount-1))),i=Math.floor(f);return inner[i]*(1-(f-i))+inner[Math.min(binCount-1,i+1)]*(f-i);};
 let low=Infinity,high=-Infinity;for(const line of dst.lines)for(const j of [0,2]){const [u,r]=polar(line[j],line[j+1]),v=r-baseline(u);low=Math.min(low,v);high=Math.max(high,v);}
 const c=document.createElement('canvas');c.width=2048;c.height=512;const ctx=c.getContext('2d');ctx.lineWidth=1.45;ctx.lineCap='round';const project=(x,y)=>{const [u,r]=polar(x,y);return [8+u*2032,8+(r-baseline(u)-low)/Math.max(1,high-low)*496];};
 for(const [x,y,nx,ny,g] of dst.lines){ctx.strokeStyle=colors[g];ctx.beginPath();ctx.moveTo(...project(x,y));for(let k=1;k<=3;k++)ctx.lineTo(...project(x+(nx-x)*k/3,y+(ny-y)*k/3));ctx.stroke();}return c;
},
texture(THREE,p){
 const cacheKey=JSON.stringify([p.layout,p.angle,p.colors,!!p.edgeImage]);if(p.edgeTexture&&p.edgeSource===(p.edgeImage||p.image)&&p.edgeCacheKey===cacheKey)return p.edgeTexture;
 if(p.edgeTexture)p.edgeTexture.dispose();
 const chosen=p.edgeImage?'u':p.layout==='auto'?(p.dst?this.layout(p.dst):'straight'):p.layout;
 const src=p.edgeImage||(p.dst&&chosen==='u'?this.rectifyDST(p.dst,p.colors):p.image);
 const c=document.createElement('canvas');c.width=2048;c.height=512;const ctx=c.getContext('2d');ctx.save();ctx.translate(1024,256);ctx.rotate(p.angle*Math.PI/180);ctx.drawImage(src,-1016,-248,2032,496);ctx.restore();
 const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;p.detectedLayout=chosen;p.edgeTexture=texture;p.edgeSource=p.edgeImage||p.image;p.edgeCacheKey=cacheKey;return texture;
}
};
