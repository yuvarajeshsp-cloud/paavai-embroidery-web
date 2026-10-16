// Ported from Paavai Blouse Studio (dist/studio-features.js); logic unchanged, only turned into a module.
/* Geometry helpers for surface-following borders and visual size adjustments. */
export const PaavaiFeatures={
makeBorderTexture(THREE){
 const c=document.createElement('canvas');c.width=256;c.height=128;const ctx=c.getContext('2d');
 ctx.strokeStyle='#edc773';ctx.fillStyle='#f0d28f';ctx.lineWidth=2.4;ctx.lineCap='round';
 // Twin zari lines with a repeating floral vine between them.
 for(const y of [12,116]){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y);ctx.stroke();}
 ctx.beginPath();ctx.moveTo(0,64);ctx.bezierCurveTo(60,20,68,108,128,64);ctx.bezierCurveTo(188,20,196,108,256,64);ctx.stroke();
 for(const x of [64,192]){for(let k=0;k<6;k++){ctx.save();ctx.translate(x,64);ctx.rotate(k*Math.PI/3);ctx.beginPath();ctx.ellipse(0,13,5.5,12,0,0,Math.PI*2);ctx.stroke();ctx.restore();}ctx.beginPath();ctx.arc(x,64,4,0,Math.PI*2);ctx.fill();}
 for(const x of [8,120,136,248]){ctx.save();ctx.translate(x,64);ctx.rotate(x%16===8?.6:-.6);ctx.beginPath();ctx.ellipse(0,0,4,10,0,0,Math.PI*2);ctx.fill();ctx.restore();}
 const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=THREE.RepeatWrapping;texture.anisotropy=4;return texture;
},
makeBorders(THREE,geometry,paths,material,options=null){
 const pos=geometry.attributes.position.array,norm=geometry.attributes.normal.array,cell=.065,grid=new Map();
 const key=(x,y,z)=>`${x},${y},${z}`;
 for(let i=0;i<pos.length;i+=3){const k=key(Math.floor(pos[i]/cell),Math.floor(pos[i+1]/cell),Math.floor(pos[i+2]/cell));if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);}
 function nearest(p){let best=-1,min=Infinity;const x=Math.floor(p.x/cell),y=Math.floor(p.y/cell),z=Math.floor(p.z/cell);for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(let c=-1;c<=1;c++){const list=grid.get(key(x+a,y+b,z+c));if(!list)continue;for(const i of list){const d=(pos[i]-p.x)**2+(pos[i+1]-p.y)**2+(pos[i+2]-p.z)**2;if(d<min){min=d;best=i;}}}if(best<0)throw Error('Border could not be placed on blouse surface.');return {point:new THREE.Vector3(pos[best],pos[best+1],pos[best+2]),normal:new THREE.Vector3(norm[best],norm[best+1],norm[best+2]).normalize()};}
 const buckets=Array.from({length:4},()=>({p:[],n:[],uv:[],idx:[]}));
 for(const raw of paths){const path=raw.map(p=>new THREE.Vector3(...p)),center=path.reduce((a,p)=>a.add(p),new THREE.Vector3()).multiplyScalar(1/path.length);const cuff=Math.abs(center.x)>.5;if(!cuff&&center.y<-.4)continue;let desired;
 if(cuff)desired=new THREE.Vector3(-Math.sign(center.x)*.28,.96,0);else desired=new THREE.Vector3(0,center.y<-.4?1:-1,0);
 const inners=[],normals=[];let score=0;
 for(let i=0;i<path.length;i++){const tangent=path[(i+1)%path.length].clone().sub(path[(i-1+path.length)%path.length]).normalize();const n=nearest(path[i]).normal;const inner=new THREE.Vector3().crossVectors(n,tangent).normalize();score+=inner.dot(desired);inners.push(inner);normals.push(n);}
 if(score<0)inners.forEach(v=>v.negate());
 let arc=0;const rows=[];
 for(let i=0;i<=path.length;i++){const j=i%path.length;if(i)arc+=path[j].distanceTo(path[(j-1+path.length)%path.length]);const row=[];
 for(let w=0;w<=4;w++){const panel=cuff?(center.x<0?1:2):(path[j].z>=0?0:3),option=options?.[panel];const width=option?.bandWidth??(cuff?.074:.067),inset=option?.inset??.010;const target=path[j].clone().addScaledVector(inners[j],inset+width*w/4);const near=nearest(target);const point=target.addScaledVector(near.normal,-target.clone().sub(near.point).dot(near.normal)+.0035);row.push({p:point,n:near.normal,u:arc/.22,v:w/4});}rows.push(row);}
 for(let i=0;i<path.length;i++){const mid=path[i].clone().add(path[(i+1)%path.length]).multiplyScalar(.5);
 // Wearer's front-left remains plain, matching the agreed design layout.
 if(!cuff&&mid.z>0&&mid.x>0)continue;
 const panel=cuff?(center.x<0?1:2):(mid.z>=0?0:3),b=buckets[panel];b.period=arc/.22;
 for(let w=0;w<4;w++){const points=[rows[i][w],rows[i+1][w],rows[i][w+1],rows[i+1][w+1]],start=b.p.length/3;for(const v of points){b.p.push(v.p.x,v.p.y,v.p.z);b.n.push(v.n.x,v.n.y,v.n.z);b.uv.push(v.u,v.v);}b.idx.push(start,start+1,start+2,start+1,start+3,start+2);}}
 }
 return buckets.map((b,panel)=>{
 if(options?.[panel]&&b.uv.length){
  const o=options[panel],values=[...new Set(b.uv.filter((_,i)=>i%2===0))].sort((a,b)=>a-b);let start=0,span=b.period;
  if(panel===0||panel===3){let gap=-1;for(let i=0;i<values.length;i++){const next=i+1<values.length?values[i+1]:values[0]+b.period,d=next-values[i];if(d>gap){gap=d;start=next%b.period;}}span=Math.max(.001,b.period-gap);}
  for(let i=0;i<b.uv.length;i+=2){let u=panel===1||panel===2?b.uv[i]/span:((b.uv[i]-start+b.period)%b.period)/span;if(u>1&&u<1.001)u=1;b.uv[i]=(u-.5)/(o.width/100)+.5-(o.shift||0)/100;}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(b.n,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));g.setIndex(b.idx);const m=new THREE.Mesh(g,Array.isArray(material)?material[panel]:material);m.userData.panel=panel;m.renderOrder=2;return m;});
},
resizeMeshes(THREE,meshes,size){
 const smooth=(a,b,x)=>{let t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
 const width=size.width/100,length=size.length/100,sleeve=size.sleeve/100,sleeveWidth=(size.sleeveWidth||100)/100;
 for(const m of meshes){const g=m.geometry;if(!g.userData.restPosition){g.userData.restPosition=g.attributes.position.array.slice();g.userData.restNormal=g.attributes.normal.array.slice();}
 const rest=g.userData.restPosition,rn=g.userData.restNormal,p=g.attributes.position.array,n=g.attributes.normal.array;
 for(let i=0;i<p.length;i+=3){const x=rest[i],y=rest[i+1],z=rest[i+2],arm=smooth(.62,.88,Math.abs(x)),sign=x<0?-1:1,ax=sign*.28,ay=-.96,t=Math.max(0,(x-sign*.76)*ax+(y-.60)*ay),extension=t*(sleeve-1)*arm;
 const rawT=(x-sign*.76)*ax+(y-.60)*ay,radialX=x-sign*.76-ax*rawT,radialY=y-.60-ay*rawT,radialScale=1+arm*(sleeveWidth-1);p[i]=(x+ax*extension+radialX*(radialScale-1))*width;p[i+1]=y+ay*extension+radialY*(radialScale-1)+Math.min(0,y-.55)*(length-1)*(1-arm);p[i+2]=z*radialScale*width;
 // Preserve smooth normals across duplicate UV vertices while adapting to scale.
 let nx=rn[i],ny=rn[i+1],nz=rn[i+2],dot=nx*ax+ny*ay,stretch=1+arm*(sleeve-1);nx=(nx-ax*dot)/radialScale+ax*dot/stretch;ny=(ny-ay*dot)/radialScale+ay*dot/stretch;nz/=radialScale;nx/=width;nz/=width;ny/=1+(length-1)*(1-arm)*(y<.55?1:0);const mag=Math.hypot(nx,ny,nz)||1;n[i]=nx/mag;n[i+1]=ny/mag;n[i+2]=nz/mag;
 }g.attributes.position.needsUpdate=true;g.attributes.normal.needsUpdate=true;g.computeBoundingSphere();}
}
};
