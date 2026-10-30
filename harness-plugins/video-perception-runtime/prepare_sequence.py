import json,sys,math
from pathlib import Path
import cv2
def main():
 a=json.load(sys.stdin);c=cv2.VideoCapture(a['file']);rate=float(c.get(cv2.CAP_PROP_FPS));start,end=float(a['start']),float(a['end']);fps=float(a.get('fps',8));root=Path(a['output']);root.mkdir(parents=True,exist_ok=True)
 if not c.isOpened() or rate<=0 or not 0<=start<end or end-start>3.01 or not 1<=fps<=8:raise ValueError('视频片段须为3秒内、采样1至8fps')
 offset=float(a.get('timeOffset',0));frames=[];count=0;skipped=0;nexttime=start;last=-1;lastframe=None
 while True:
  ok,frame=c.read()
  if not ok:break
  rawtime=c.get(cv2.CAP_PROP_POS_MSEC)/1000;t=rawtime if rawtime>=0 and rawtime>last else count/rate;last=t
  if t>=end:break
  count+=1
  if t<start:skipped+=1;continue;lastframe=(t,frame)
  if t+1/rate/2<nexttime:continue
  h,w=frame.shape[:2];scale=min(1,448/max(w,h));small=cv2.resize(frame,(round(w*scale),round(h*scale)));p=root/(str(len(frames)).zfill(3)+'.jpg');p.write_bytes(cv2.imencode('.jpg',small,[cv2.IMWRITE_JPEG_QUALITY,88])[1].tobytes());frames.append({'file':str(p),'time':t+offset,'width':small.shape[1],'height':small.shape[0]});nexttime+=1/fps
 if lastframe and frames and lastframe[0]+offset-frames[-1]['time']>1/rate:
  t,frame=lastframe;h,w=frame.shape[:2];scale=min(1,448/max(w,h));small=cv2.resize(frame,(round(w*scale),round(h*scale)));p=root/'end.jpg';p.write_bytes(cv2.imencode('.jpg',small)[1].tobytes());frames.append({'file':str(p),'time':t+offset,'width':small.shape[1],'height':small.shape[0]})
 c.release()
 if not frames:raise RuntimeError('片段中没有解码到可用画面')
 print(json.dumps({'frames':frames,'decodedFrames':count-skipped,'sourceFPS':rate,'samplingFPS':fps,'range':{'start':start+offset,'end':end+offset},'actualFirst':frames[0]['time'],'actualLast':frames[-1]['time'],'frameTimeBasis':'decoder POS_MSEC with FPS fallback'}))
if __name__=='__main__':main()
