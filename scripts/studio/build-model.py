"""Connected implicit dress form, extracted as a welded triangle surface.
The blouse is clipped from an offset of the SAME continuous surface.
No detached cylinders or overlapping shoulder caps are used.
"""
import numpy as np,json
from scipy.interpolate import PchipInterpolator
from pathlib import Path
# Website copy: writes scripts/studio/out/model.js (git-ignored); then run
# node scripts/encode-mannequin.mjs scripts/studio/out/model.js public/3d/mannequin.bin
OUT=Path(__file__).resolve().parent/'out'
OUT.mkdir(exist_ok=True)

def smin(a,b,k=.14):
 h=np.maximum(k-np.abs(a-b),0)/k
 return np.minimum(a,b)-h*h*k*.25

def smax(a,b,k=.055):
 return -smin(-a,-b,k)

# C1-continuous anatomical profiles prevent ridges at interpolation rows.
RX=PchipInterpolator([-1.2,-.80,-.55,-.25,.10,.37,.64,.85,1.4], [.59,.53,.51,.55,.64,.69,.69,.64,.60])
RZ=PchipInterpolator([-1.2,-.80,-.55,-.25,.10,.37,.64,.85,1.4], [.34,.30,.285,.31,.335,.34,.29,.235,.23])

def ell(x,y,z,c,r):
 return (np.sqrt(((x-c[0])/r[0])**2+((y-c[1])/r[1])**2+((z-c[2])/r[2])**2)-1)*min(r)

def field(p):
 x,y,z=np.moveaxis(p,-1,0)
 rx=RX(y);rz=RZ(y)
 # Broad, smoothly joined bust contours and a gentle lumbar curve.
 frontWeight=.5+.5*np.tanh(z/.10)
 depth=rz+.165*np.exp(-((np.sqrt(x*x+.002)-.335)/.255)**2-((y-.29)/.29)**2)*frontWeight
 centerZ=-.018*np.exp(-((y+.34)/.42)**2)
 d=(np.sqrt((x/rx)**2+((z-centerZ)/depth)**2)-1)*.32
 shoulderHeight=1.015-.285*np.minimum(np.sqrt(x*x+.0004)/.80,1)**1.65
 d=smax(d,y-shoulderHeight,.11)
 d=smax(d,-1.04-y,.065)
 for sign in [-1,1]:
  shoulder=ell(x,y,z,(sign*.64,.65,-.005),(.295,.235,.265))
  d=smin(d,shoulder,.16)
  # A single tapered upper arm, smoothly joined to the shoulder volume.
  root=np.array([sign*.76,.60,0]);axis=np.array([sign*.28,-.96,0]);axis/=np.linalg.norm(axis)
  delta=p-root;t=np.sum(delta*axis,axis=-1);q=delta-t[...,None]*axis
  radius=.235-.030*np.clip(t,0,.9)/.9
  arm=np.sqrt(np.sum(q*q,axis=-1))-radius
  arm=smax(arm,-.16-t,.07)
  arm=smax(arm,t-.88,.060)
  d=smin(d,arm,.15)
 neckRadius=.185+.025*np.clip((1.24-y)/.40,0,1)
 neck=(np.sqrt((x/1.04)**2+(z+.012)**2)-neckRadius)
 neck=smax(neck,.79-y,.065)
 neck=smax(neck,y-1.30,.060)
 return smin(d,neck,.18)

def normal(p):
 eps=.0003;g=np.stack([(field(p+np.eye(3)[i]*eps)-field(p-np.eye(3)[i]*eps))/(2*eps) for i in range(3)],axis=-1)
 return g/np.maximum(np.linalg.norm(g,axis=-1,keepdims=True),1e-12)

def extract(level):
 step=.031
 axes=[np.arange(-1.4,1.401,step),np.arange(-1.15,1.421,step),np.arange(-.65,.701,step)]
 xyz=np.stack(np.meshgrid(*axes,indexing='ij'),axis=-1);f=field(xyz)-level
 offsets=np.array([[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]])
 base=np.stack(np.meshgrid(np.arange(len(axes[0])-1),np.arange(len(axes[1])-1),np.arange(len(axes[2])-1),indexing='ij'),axis=-1).reshape(-1,3)
 cells=base[:,None,:]+offsets[None,:,:];vals=f[cells[:,:,0],cells[:,:,1],cells[:,:,2]]
 mask=(vals.min(axis=1)<=0)&(vals.max(axis=1)>0);cells=cells[mask];vals=vals[mask]
 positions=xyz[cells[:,:,0],cells[:,:,1],cells[:,:,2]]
 tetsets=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]]
 edges=[(0,1),(1,2),(2,0),(0,3),(1,3),(2,3)];tris=[]
 for tet in tetsets:
  p=positions[:,tet];v=vals[:,tet];bits=((v<0)*[1,2,4,8]).sum(axis=1)
  for case in range(1,15):
   mask=bits==case
   if not mask.any():continue
   pp=p[mask];vv=v[mask];cross=[(a,b) for a,b in edges if bool(case&(1<<a))!=bool(case&(1<<b))]
   vertices=np.stack([pp[:,a]+(pp[:,b]-pp[:,a])*(-vv[:,a]/(vv[:,b]-vv[:,a]))[:,None] for a,b in cross],axis=1)
   if len(cross)==4:
    # Order the quad using a representative linear tetrahedron intersection.
    mid=vertices[0];center=mid.mean(axis=0);u=mid[0]-center;u/=np.linalg.norm(u);n=np.cross(mid[1]-center,u);n/=np.linalg.norm(n);w=np.cross(n,u)
    order=np.argsort(np.arctan2((mid-center)@w,(mid-center)@u));vertices=vertices[:,order]
   tris.append(vertices[:,[0,1,2]])
   if len(cross)==4:tris.append(vertices[:,[0,2,3]])
 tr=np.concatenate(tris);n=normal(tr.mean(axis=1));reverse=np.sum(np.cross(tr[:,1]-tr[:,0],tr[:,2]-tr[:,0])*n,axis=1)<0
 tr[reverse]=tr[reverse][:,[0,2,1]]
 return tr

def cut_value(p,kind):
 x,y,z=p
 if kind==0:return y+.66
 if kind==1:
  # Neckline is a round front and a deeper U at the back.
  back=np.clip((-z+.015)/.10,0,1);back=back*back*(3-2*back)
  front=.62+.44*(abs(x)/.44)**2
  rear=.025+1.05*(abs(x)/.44)**4
  return front*(1-back)+rear*back-y
 sign=-1 if x<0 else 1
 axis=np.array([sign*.28,-.96,0]);axis/=np.linalg.norm(axis)
 t=np.dot(p-np.array([sign*.76,.60,0]),axis)
 return max(.62-t,.69-abs(x))

def clip(tris):
 out=[]
 for triangle in tris:
  poly=list(triangle)
  for kind in range(3):
   if not poly:break
   result=[]
   for a,b in zip(poly,poly[1:]+poly[:1]):
    va,vb=cut_value(a,kind),cut_value(b,kind)
    if va>=0:result.append(a)
    if (va>=0)!=(vb>=0):result.append(a+(b-a)*(va/(va-vb)))
   poly=result
  for i in range(1,len(poly)-1):out.append([poly[0],poly[i],poly[i+1]])
 return np.array(out)

def weld(tr):
 verts,idx=np.unique(np.round(tr.reshape(-1,3),8),axis=0,return_inverse=True);faces=idx.reshape(-1,3)
 keep=np.linalg.norm(np.cross(verts[faces[:,1]]-verts[faces[:,0]],verts[faces[:,2]]-verts[faces[:,0]]),axis=1)>0
 return verts,faces[keep]

def components(v,f):
 parent=list(range(len(v)))
 def find(i):
  while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
  return i
 for a,b,c in f:
  for i in [b,c]:parent[find(i)]=find(a)
 return len({find(int(i)) for i in np.unique(f)})

skin=extract(0);shell=extract(.018);blouse=clip(shell);sv,sf=weld(skin);bv,bf=weld(blouse);shellv,shellf=weld(shell)
assert components(sv,sf)==1,'Mannequin must be connected'
assert components(bv,bf)==1,'Blouse shoulders must be connected'
# Only expected clothing boundaries are allowed: neckline, lower hem, two sleeve cuffs.
from collections import Counter
edgecounts=Counter(tuple(sorted((int(a),int(b)))) for tri in bf for a,b in zip(tri,np.roll(tri,-1)))
boundary=[e for e,c in edgecounts.items() if c==1]
badj={}
for a,b in boundary:badj.setdefault(a,set()).add(b);badj.setdefault(b,set()).add(a)
seen=set();loops=0;loop_vertices=[]
for start in badj:
 if start in seen:continue
 loops+=1;stack=[start];members=[]
 while stack:
  cur=stack.pop()
  if cur in seen:continue
  seen.add(cur);members.append(cur);stack.extend(badj[cur]-seen)
 loop_vertices.append(members)
print('Boundary loops:',[(len(m),bv[m].mean(axis=0).round(4).tolist()) for m in loop_vertices])
assert loops==4,f'Expected 4 garment openings, got {loops}'
assert all(len(neighbors)==2 for neighbors in badj.values()), 'Each hem must be a clean closed loop'
edgepaths=[]
for members in loop_vertices:
 start=members[0];ordered=[start];previous=None;current=start
 while True:
  nxt=next(v for v in badj[current] if v!=previous)
  if nxt==start:break
  ordered.append(nxt);previous,current=current,nxt
 path=bv[ordered];closed=np.vstack([path,path[0]])
 distances=np.r_[0,np.cumsum(np.linalg.norm(np.diff(closed,axis=0),axis=1))]
 samples=np.linspace(0,distances[-1],max(96,int(distances[-1]/.014)),endpoint=False)
 evenly=np.stack([np.interp(samples,distances,closed[:,i]) for i in range(3)],axis=1)
 # Smooth only sub-millimetre sampling noise; preserve intended neckline shape.
 for _ in range(2):evenly=.25*np.roll(evenly,1,axis=0)+.5*evenly+.25*np.roll(evenly,-1,axis=0)
 edgepaths.append(evenly.round(6).tolist())
# Preserve a smooth shared geometric normal even at the separate UV panel seams.
def packed(v,f,iscloth):
 ns=normal(v);out={'position':[],'normal':[],'uv':[],'index':[],'groups':[]};lookup={};groups=[[],[],[]] if iscloth else [[]]
 for tri in f:
  center=v[tri].mean(axis=0);x,y,z=center
  mat=(1 if x<0 else 2) if iscloth and abs(x)>.69+.055*(.65-y) else 0
  groups[mat].append(tri)
 start=0
 for mat,faces in enumerate(groups):
  for tri in faces:
   pts=v[tri]
   if mat==0:
    us=(np.arctan2(pts[:,0],pts[:,2])/(2*np.pi))%1
    if us.max()-us.min()>.5:us=np.where(us<.5,us+1,us)
    uvs=np.stack([us,(pts[:,1]+.66)/1.69],axis=1)
   else:
    sign=-1 if mat==1 else 1;axis=np.array([sign*.28,-.96,0]);axis/=np.linalg.norm(axis);radial=np.array([.96,sign*.28,0]);q=pts-np.array([sign*.76,.60,0]);t=q@axis
    us=(np.arctan2(q@radial,q[:,2])/(2*np.pi))%1
    if us.max()-us.min()>.5:us=np.where(us<.5,us+1,us)
    uvs=np.stack([us,1-t/.64],axis=1)
   for vertex,point,norm,uv in zip(tri,pts,ns[tri],uvs):
    key=(int(vertex),mat,int(uv[0]>=1))
    if key not in lookup:
     lookup[key]=len(out['position'])//3
     out['position'].extend(point.round(7).tolist());out['normal'].extend(norm.round(6).tolist());out['uv'].extend(uv.round(6).tolist())
    out['index'].append(lookup[key])
  count=len(faces)*3;out['groups'].append([start,count,mat]);start+=count
 return out
# Save geometry as compact typed arrays; a tiny JS decoder avoids fetch race conditions.
import base64
assets={}
for label,v,f,cloth in [('skin',sv,sf,False),('blouse',bv,bf,True),('shell',shellv,shellf,True)]:
 data=packed(v,f,cloth)
 assets[label]={key:base64.b64encode(np.array(value,dtype='<u4' if key=='index' else '<f4').tobytes()).decode() if key!='groups' else value for key,value in data.items()}
assets['edges']=edgepaths
(OUT/'model.js').write_text('window.PAAVAI_MODEL='+json.dumps(assets,separators=(',',':'))+';\n')
qa_dir=OUT/'qa'
qa_dir.mkdir(exist_ok=True)
np.savez(qa_dir/'model-qa.npz',sv=sv,sf=sf,bv=bv,bf=bf,sn=normal(sv),bn=normal(bv))
print(json.dumps({'skin_triangles':len(sf),'blouse_triangles':len(bf),'skin_components':1,'blouse_components':1,'garment_openings':loops,'model_bytes':(OUT/'model.js').stat().st_size}))
