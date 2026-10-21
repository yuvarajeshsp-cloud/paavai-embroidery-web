// Ported from Paavai Blouse Studio (dist/garment-builder.js); logic unchanged, only turned into a module.
/* Re-cut the garment from an uncut connected shell so neck openings truly change. */
export const PaavaiShape={
build(THREE,shell,shape){
 const p=shell.attributes.position.array,n=shell.attributes.normal.array,uv=shell.attributes.uv.array,indices=shell.index.array;
 const result={p:[],n:[],uv:[],groups:[]},segments=[];
 function cut(v,kind){const x=v[0],y=v[1],z=v[2];if(kind===0)return y+.66;if(kind===1){let blend=Math.max(0,Math.min(1,(-z+.015)/.10));blend=blend*blend*(3-2*blend);const front=.62+(shape.frontHeight-100)*.006+.44*(Math.abs(x)/(.44*shape.frontWidth/100))**2;const back=.025+(shape.backHeight-100)*.006+1.05*(Math.abs(x)/(.44*shape.backWidth/100))**4;return front*(1-blend)+back*blend-y;}const sign=x<0?-1:1,t=(x-sign*.76)*sign*.28+(y-.60)*-.96;return Math.max(.62-t,.69-Math.abs(x));}
 function vertex(i){return [p[i*3],p[i*3+1],p[i*3+2],n[i*3],n[i*3+1],n[i*3+2],uv[i*2],uv[i*2+1],0];}
 for(const group of shell.groups){const start=result.p.length/3;
 for(let i=group.start;i<group.start+group.count;i+=3){let poly=[vertex(indices[i]),vertex(indices[i+1]),vertex(indices[i+2])];
 for(let kind=0;kind<3&&poly.length;kind++){const next=[];
 for(let j=0;j<poly.length;j++){const a=poly[j],b=poly[(j+1)%poly.length],va=cut(a,kind),vb=cut(b,kind);if(Math.abs(va)<1e-10)a[8]|=1<<kind;if(va>=0)next.push(a);if((va>=0)!==(vb>=0)){const t=va/(va-vb),q=[];for(let k=0;k<8;k++)q.push(a[k]+(b[k]-a[k])*t);q.push((a[8]&b[8])|(1<<kind));next.push(q);}}poly=next;}
 if(poly.length<3)continue;
 for(let j=0;j<poly.length;j++){const a=poly[j],b=poly[(j+1)%poly.length];if(a[8]&b[8])segments.push([a.slice(0,3),b.slice(0,3)]);}
 for(let j=1;j+1<poly.length;j++)for(const v of [poly[0],poly[j],poly[j+1]]){result.p.push(v[0],v[1],v[2]);const mag=Math.hypot(v[3],v[4],v[5])||1;result.n.push(v[3]/mag,v[4]/mag,v[5]/mag);result.uv.push(v[6],v[7]);}
 }result.groups.push([start,result.p.length/3-start,group.materialIndex]);}
 // Reassemble the exact intersection segments into the four closed garment edges.
 const nodes=new Map(),key=v=>v.map(x=>Math.round(x*1e5)).join(',');
 for(const [a,b] of segments){const ka=key(a),kb=key(b);if(ka===kb)continue;for(const [k,v] of [[ka,a],[kb,b]])if(!nodes.has(k))nodes.set(k,{p:v,next:new Set()});nodes.get(ka).next.add(kb);nodes.get(kb).next.add(ka);}
 const seen=new Set(),paths=[];
 for(const [start,node] of nodes){if(seen.has(start))continue;const path=[];let prev=null,current=start;
 do{if(seen.has(current))throw Error('Could not form a clean neckline. Try a nearby setting.');seen.add(current);const node=nodes.get(current);if(node.next.size!==2)throw Error('Could not close the blouse edge. Try a nearby setting.');path.push(node.p);const next=[...node.next].find(k=>k!==prev);prev=current;current=next;}while(current!==start);
 if(path.length<12)continue;
 // Arc-length sampling gives evenly spaced border motifs on every neckline size.
 const pts=path.map(v=>new THREE.Vector3(...v)),cum=[0];for(let i=1;i<=pts.length;i++)cum.push(cum[i-1]+pts[i%pts.length].distanceTo(pts[i-1]));const len=cum[cum.length-1],count=Math.max(96,Math.ceil(len/.014)),even=[];let index=0;
 for(let i=0;i<count;i++){const at=i/count*len;while(cum[index+1]<at)index++;even.push(pts[index].clone().lerp(pts[(index+1)%pts.length],(at-cum[index])/(cum[index+1]-cum[index])));}
 for(let round=0;round<2;round++){const smooth=even.map((v,i)=>v.clone().multiplyScalar(.5).addScaledVector(even[(i+count-1)%count],.25).addScaledVector(even[(i+1)%count],.25));even.splice(0,even.length,...smooth);}
 paths.push(even.map(v=>v.toArray()));}
 if(paths.length!==4)throw Error('This neckline setting cannot form a connected blouse.');
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(result.p,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(result.n,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(result.uv,2));for(const group of result.groups)geometry.addGroup(...group);geometry.computeBoundingSphere();return {geometry,paths};
}
};
