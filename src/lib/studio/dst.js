// Ported from Paavai Blouse Studio (dist/dst.js); logic unchanged, only turned into a module.
/* Tajima DST displacement decoding, following the documented pyembroidery DstReader bit layout. */
export function parseDST(buffer){
const b=new Uint8Array(buffer);if(b.length<515||String.fromCharCode(...b.slice(0,3))!=='LA:')throw Error('This does not look like a valid Tajima DST file.');
const bit=(v,n)=>(v>>n)&1;let x=0,y=0,group=0,ended=false;const lines=[];let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
for(let i=512;i+2<b.length;i+=3){let a=b[i],c=b[i+1],d=b[i+2];if((d&3)!==3)throw Error('Invalid DST stitch record.');if((d&243)===243){ended=true;break;}if((d&67)===67&&(d&195)!==195)throw Error('Sequin DST files are not supported in this preview.');
let dx=81*(bit(d,2)-bit(d,3))+27*(bit(c,2)-bit(c,3))+9*(bit(a,2)-bit(a,3))+3*(bit(c,0)-bit(c,1))+bit(a,0)-bit(a,1);
let dy=-(81*(bit(d,5)-bit(d,4))+27*(bit(c,5)-bit(c,4))+9*(bit(a,5)-bit(a,4))+3*(bit(c,7)-bit(c,6))+bit(a,7)-bit(a,6));
let nx=x+dx,ny=y+dy;if((d&195)===195){group++;}else if((d&131)!==131){lines.push([x,y,nx,ny,group]);minX=Math.min(minX,x,nx);maxX=Math.max(maxX,x,nx);minY=Math.min(minY,y,ny);maxY=Math.max(maxY,y,ny);}x=nx;y=ny;
if(lines.length>350000)throw Error('This DST is too large for this preview (350,000 stitch limit).');if(group>100)throw Error('This preview supports up to 101 thread sections.');}
if(!ended)throw Error('DST end record is missing; the file may be incomplete.');if(!lines.length)throw Error('This DST contains no drawable stitches.');return {lines,minX,maxX,minY,maxY,groups:group+1,widthMM:(maxX-minX)/10,heightMM:(maxY-minY)/10};}
