"""Frame-by-frame feature trajectories; not semantic identity or a scene narrative."""
import sys,json,math
from pathlib import Path
import cv2,numpy as np
def main():
 a=json.load(sys.stdin);c=cv2.VideoCapture(a['file'])
 if not c.isOpened():raise RuntimeError('OpenCV无法解码视频')
 fps=float(c.get(cv2.CAP_PROP_FPS));n=int(c.get(cv2.CAP_PROP_FRAME_COUNT));sw=int(c.get(cv2.CAP_PROP_FRAME_WIDTH));sh=int(c.get(cv2.CAP_PROP_FRAME_HEIGHT));start=float(a.get('start',0));end=float(a.get('end',min(12,n/fps)));scale=min(1,640/max(sw,sh));w,h=round(sw*scale),round(sh*scale)
 if fps<=0 or not 0<=start<end or end-start>12.01:raise ValueError('轨迹分析每次0至12秒，须有可确定帧率')
 offset=float(a.get('timeOffset',0));prev=None;pts=None;ids=[];tracks={};cuts=[];count=0;nextid=0;timings=[];frames=[];lasttime=-1
 roi=a.get('roi')
 if roi is not None and (len(roi)!=4 or any(not math.isfinite(float(x)) for x in roi) or roi[2]<=0 or roi[3]<=0 or roi[0]<0 or roi[1]<0 or roi[0]+roi[2]>sw or roi[1]+roi[3]>sh):raise ValueError('roi须为原视频像素内[x,y,width,height]')
 while True:
  ok,frame=c.read()
  if not ok:break
  ms=c.get(cv2.CAP_PROP_POS_MSEC)/1000;t=ms if ms>=start and ms>lasttime else start+count/fps
  if t>=end-.0001:break
  lasttime=t
  if t<start:count+=1;continue
  timings.append(t);frame=cv2.resize(frame,(w,h));gray=cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY)
  if prev is not None:
   diff=float(np.mean(cv2.absdiff(gray,prev)))
   if diff>30:
    cuts.append({'time':round(t,4),'meanPixelDifference':round(diff,2)});pts=None;ids=[]
   if pts is not None and len(pts):
    nxt,st,err=cv2.calcOpticalFlowPyrLK(prev,gray,pts,None,winSize=(21,21),maxLevel=3);back,bst,_=cv2.calcOpticalFlowPyrLK(gray,prev,nxt,None,winSize=(21,21),maxLevel=3);good=(st.reshape(-1)==1)&(bst.reshape(-1)==1)&(np.linalg.norm(pts.reshape(-1,2)-back.reshape(-1,2),axis=1)<1.8)&(err.reshape(-1)<35)
    good &= np.isfinite(nxt.reshape(-1,2)).all(axis=1);ids=[i for i,k in zip(ids,good) if k];pts=nxt[good].reshape(-1,1,2)
    for i,p in zip(ids,pts):tracks[i].append([t,float(p[0][0]),float(p[0][1])])
  if pts is None or count%6==0 and len(pts)<90:
   mask=np.full_like(gray,255)
   if roi is not None:
    mask[:]=0;x,y,rw,rh=[round(float(x)*scale) for x in roi];mask[y:y+rh,x:x+rw]=255
   if pts is not None:
    for p in pts:cv2.circle(mask,tuple(np.round(p[0]).astype(int)),9,0,-1)
   add=cv2.goodFeaturesToTrack(gray,maxCorners=max(1,100-(len(pts) if pts is not None else 0)),qualityLevel=.02,minDistance=8,mask=mask)
   if add is not None:
    for p in add:tracks[nextid]=[[t,float(p[0][0]),float(p[0][1])]];ids.append(nextid);nextid+=1
    pts=add if pts is None else np.concatenate([pts,add])
  prev=gray;count+=1
 c.release();summaries=[]
 for i,p in tracks.items():
  if len(p)<3:continue
  arr=np.array(p);delta=np.diff(arr[:,1:],axis=0);length=float(np.linalg.norm(delta,axis=1).sum());dx,dy=arr[-1,1:]-arr[0,1:];phases=[]
  for lo,hi in zip(np.linspace(start,end,5)[:-1],np.linspace(start,end,5)[1:]):
   q=arr[(arr[:,0]>=lo)&(arr[:,0]<=hi)]
   if len(q)>1:phases.append({'from':round(float(q[0,0]),3),'to':round(float(q[-1,0]),3),'dx':round(float(q[-1,1]-q[0,1]),2),'dy':round(float(q[-1,2]-q[0,2]),2)})
  idx=np.unique(np.linspace(0,len(p)-1,min(12,len(p))).round().astype(int));summaries.append({'featureId':i,'from':round(p[0][0],3),'to':round(p[-1][0],3),'trackedFrames':len(p),'dx':round(float(dx),2),'dy':round(float(dy),2),'pathPixels':round(length,2),'possibleReversal':length>max(15,1.8*math.hypot(dx,dy)),'quarterDisplacements':phases,'samples':[[round(v,3) for v in p[j]] for j in idx]})
 moving=[s for s in summaries if s['pathPixels']>=8];moving.sort(key=lambda s:s['pathPixels'],reverse=True)
 complete=[s for s in summaries if s['trackedFrames']>=max(3,count*.85)];dxs=[s['dx'] for s in complete];dys=[s['dy'] for s in complete];globalmove=len(complete)>=8 and abs(float(np.median(dxs)))+abs(float(np.median(dys)))>12 and np.std(dxs)<8 and np.std(dys)<8
 result=dict(method='OpenCV pyramidal Lucas-Kanade with forward-backward check',range={'start':start,'end':end},sourceWidth=sw,sourceHeight=sh,analysisWidth=w,analysisHeight=h,coordinateSpace='analysis-frame-pixels; y-positive-down',roi=roi,decodedFrames=count,sourceFPS=fps,frameTimeBasis='decoder POS_MSEC with FPS fallback',maxFrameGapSeconds=round(max(np.diff(timings)),4) if len(timings)>1 else None,continuousDecodedFrames=True,featureTracks=len(summaries),movingFeatureTracks=len(moving),broadCoherentTranslation=bool(globalmove),cutCandidates=cuts,tracks=moving[:12] or sorted(summaries,key=lambda s:s['trackedFrames'],reverse=True)[:4],semantics=False,identityEstablished=False,deepseekApiCalls=0,notice='处理片段内逐个解码帧的特征点；不是给物体认身份。遮挡会断轨，切镜候选会重置，不把两条特征轨迹直接认成同一物体。共同位移可能来自镜头或整组物体，不能仅凭光流证明摄像机运动。')
 if offset:
  result['range']={'start':start+offset,'end':end+offset}
  for cut in cuts:cut['time']+=offset
  for row in result['tracks']:
   row['from']+=offset;row['to']+=offset
   for q in row['quarterDisplacements']:q['from']+=offset;q['to']+=offset
   for point in row['samples']:point[0]+=offset
 print(json.dumps(result,ensure_ascii=False))
if __name__=='__main__':main()
