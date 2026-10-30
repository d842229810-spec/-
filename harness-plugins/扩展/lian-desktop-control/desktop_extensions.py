"""Local motion batches, capture and bounded visual feedback for the existing backend."""
import ctypes as C
from ctypes import wintypes as W
import math,time,threading,json,uuid,io,base64
from pathlib import Path

def install(Desktop,api):
    U,INPUT,MOUSEINPUT,send_input,key_code,resolve,rect,print_window,ImageGrab,Image=map(api.get,['U','INPUT','MOUSEINPUT','send_input','key_code','resolve','rect','print_window','ImageGrab','Image'])
    old_init,old_capture,old_check,old_dispatch,old_status=Desktop.__init__,Desktop.capture,Desktop.check,Desktop.dispatch,Desktop.status
    G=api['G'];HEADER=api['BITMAPINFOHEADER']
    U.GetDC.argtypes=[W.HWND];U.GetDC.restype=W.HDC
    G.BitBlt.argtypes=[W.HDC,C.c_int,C.c_int,C.c_int,C.c_int,W.HDC,C.c_int,C.c_int,W.DWORD];G.BitBlt.restype=W.BOOL
    def screen_region(bounds):
        x,y,right,bottom=bounds;w,h=right-x,bottom-y
        if not 0<w<=16384 or not 0<h<=16384 or w*h>40000000:raise ValueError('WINDOW_TOO_LARGE_OR_EMPTY')
        screen=U.GetDC(None);memory=G.CreateCompatibleDC(screen);bitmap=G.CreateCompatibleBitmap(screen,w,h);previous=None
        try:
            if not screen or not memory or not bitmap:raise RuntimeError('CAPTURE_ALLOCATION_FAILED')
            previous=G.SelectObject(memory,bitmap)
            if not G.BitBlt(memory,0,0,w,h,screen,x,y,0x40CC0020):raise RuntimeError('SCREEN_REGION_CAPTURE_FAILED')
            G.SelectObject(memory,previous);previous=None;header=HEADER();header.biSize=C.sizeof(header);header.biWidth=w;header.biHeight=-h;header.biPlanes=1;header.biBitCount=32;pixels=C.create_string_buffer(w*h*4)
            if G.GetDIBits(memory,bitmap,0,h,pixels,C.byref(header),0)!=h:raise RuntimeError('CAPTURE_PIXELS_FAILED')
            return Image.frombytes('RGB',(w,h),pixels.raw,'raw','BGRX')
        finally:
            if previous:G.SelectObject(memory,previous)
            if bitmap:G.DeleteObject(bitmap)
            if memory:G.DeleteDC(memory)
            if screen:U.ReleaseDC(None,screen)
    def init(self):
        old_init(self);self.template_frames={};self.external_interruption=False
        self.takeover_watcher=threading.Thread(target=physical_watch,args=(self,),daemon=True);self.takeover_watcher.start()
    def physical_watch(self):
        # Only remember that real input occurred during an active operation; do not log keys or coordinates.
        CALLBACK=C.WINFUNCTYPE(C.c_ssize_t,C.c_int,W.WPARAM,W.LPARAM)
        class KBD(C.Structure):_fields_=[('vk',W.DWORD),('scan',W.DWORD),('flags',W.DWORD),('time',W.DWORD),('extra',W.WPARAM)]
        class MOUSE(C.Structure):_fields_=[('pt',W.POINT),('data',W.DWORD),('flags',W.DWORD),('time',W.DWORD),('extra',W.WPARAM)]
        U.SetWindowsHookExW.argtypes=[C.c_int,CALLBACK,W.HINSTANCE,W.DWORD];U.SetWindowsHookExW.restype=W.HANDLE
        U.CallNextHookEx.argtypes=[W.HANDLE,C.c_int,W.WPARAM,W.LPARAM];U.CallNextHookEx.restype=C.c_ssize_t
        U.UnhookWindowsHookEx.argtypes=[W.HANDLE];U.UnhookWindowsHookEx.restype=W.BOOL
        callbacks=[];hooks=[]
        def callback(kind):
            @CALLBACK
            def run(code,w,l):
                if code>=0 and self.target and not self.paused:
                    flags=C.cast(l,C.POINTER(KBD if kind=='key' else MOUSE)).contents.flags
                    if not flags&(0x10 if kind=='key' else 1):self.external_interruption=True
                return U.CallNextHookEx(None,code,w,l)
            return run
        try:
            for typ,kind in [(13,'key'),(14,'mouse')]:
                cb=callback(kind);callbacks.append(cb);hooks.append(U.SetWindowsHookExW(typ,cb,None,0))
            self.takeover_hooks_ready=all(hooks);msg=W.MSG()
            while not self.closed:
                while U.PeekMessageW(C.byref(msg),None,0,0,1):U.TranslateMessage(C.byref(msg));U.DispatchMessageW(C.byref(msg))
                if self.external_interruption and not self.paused:self.pause('user-takeover')
                time.sleep(.01)
        finally:
            for h in hooks:
                if h:U.UnhookWindowsHookEx(h)
    def check(self,hwnd):
        if self.external_interruption and not self.paused:self.pause('user-takeover')
        return old_check(self,hwnd)
    def capture(self,*args,**kwargs):
        value=old_capture(self,*args,**kwargs);self.template_frames[value['observationId']]=Image.open(io.BytesIO(base64.b64decode(value['pngBase64']))).convert('RGB')
        while len(self.template_frames)>5:self.template_frames.pop(next(iter(self.template_frames)))
        return value
    def smooth(self,hwnd,x,y,duration_ms=150):
        if not 0<=duration_ms<=2000:raise ValueError('durationMs must be 0..2000')
        p=W.POINT();U.GetCursorPos(C.byref(p));steps=max(1,round(duration_ms/8));began=time.monotonic()
        for i in range(1,steps+1):
            self.check(hwnd);t=i/steps;e=t*t*(3-2*t);self.move(hwnd,round(p.x+(x-p.x)*e),round(p.y+(y-p.y)*e));self.wait(hwnd,max(0,began+i*duration_ms/1000/steps-time.monotonic()))
    def relative(self,hwnd,dx,dy,duration_ms=0):
        if any(not math.isfinite(v) or abs(v)>10000 for v in [dx,dy]) or not 0<=duration_ms<=2000:raise ValueError('relative movement out of range')
        steps=max(1,round(duration_ms/8));lastx=lasty=0;began=time.monotonic()
        for i in range(1,steps+1):
            self.check(hwnd);x,y=round(dx*i/steps),round(dy*i/steps);send_input(INPUT(type=0,mi=MOUSEINPUT(x-lastx,y-lasty,0,1,0,0)));lastx,lasty=x,y;self.wait(hwnd,max(0,began+i*duration_ms/1000/steps-time.monotonic()))
    def batch(self,a):
        events=a.get('events');hwnd=resolve(a['windowId']);self.check(hwnd)
        if not isinstance(events,list) or not 1<=len(events)<=128:raise ValueError('events must contain 1..128 steps')
        allowed={'move','relative','keydown','keyup','buttondown','buttonup','type','scroll'};last=-1;end=0
        for event in events:
            at=event.get('atMs',0);duration=event.get('durationMs',0);kind=event.get('action')
            if kind not in allowed or not isinstance(at,(int,float)) or not math.isfinite(at) or at<last or at>15000:raise ValueError('events must be chronological, with atMs in 0..15000')
            if not isinstance(duration,(int,float)) or not math.isfinite(duration) or not 0<=duration<=2000:raise ValueError('durationMs out of range')
            last=at;end=max(end,at+duration)
            if kind in ['keydown','keyup']:
                for name in event.get('key','').split('+'):key_code(name)
            if kind in ['buttondown','buttonup'] and event.get('button','left') not in ['left','right','middle']:raise ValueError('unknown mouse button')
            if kind=='move':self.point(hwnd,a.get('observationId'),event['x'],event['y'])
            if kind=='relative' and any(not isinstance(event.get(k,0),(int,float)) or not math.isfinite(event.get(k,0)) or abs(event.get(k,0))>10000 for k in ['dx','dy']):raise ValueError('relative movement out of range')
            if kind=='scroll' and any(not isinstance(event.get(k,0),(int,float)) or not math.isfinite(event.get(k,0)) or abs(event.get(k,0))>2400 for k in ['scrollX','scrollY']):raise ValueError('scroll exceeds2400')
            if kind=='type' and (not isinstance(event.get('text'),str) or len(event['text'])>4000):raise ValueError('text must be <=4000 characters')
        if end>15000:raise ValueError('batch duration must be <=15 seconds')
        self.target=hwnd;began=time.monotonic();executed=[]
        try:
            for event in events:
                self.wait(hwnd,max(0,began+event.get('atMs',0)/1000-time.monotonic()));kind=event['action'];at=(time.monotonic()-began)*1000;self.check(hwnd)
                if kind=='move':x,y=self.point(hwnd,a.get('observationId'),event['x'],event['y']);smooth(self,hwnd,x,y,event.get('durationMs',150))
                elif kind=='relative':relative(self,hwnd,event.get('dx',0),event.get('dy',0),event.get('durationMs',0))
                elif kind in ['keydown','keyup']:
                    keys=[key_code(x) for x in event['key'].split('+')]
                    for vk in keys if kind=='keydown' else reversed(keys):self.keyboard(vk,kind=='keydown')
                elif kind in ['buttondown','buttonup']:self.button(event.get('button','left'),kind=='buttondown')
                elif kind=='type':
                    raw=event['text'].encode('utf-16-le');KEYBDINPUT=api['KEYBDINPUT']
                    for i in range(0,len(raw),2):
                        self.check(hwnd);unit=int.from_bytes(raw[i:i+2],'little');send_input(INPUT(type=1,ki=KEYBDINPUT(0,unit,4,0,0)));send_input(INPUT(type=1,ki=KEYBDINPUT(0,unit,6,0,0)))
                elif kind=='scroll':
                    for field,flag in [('scrollY',0x800),('scrollX',0x1000)]:
                        n=int(event.get(field,0))
                        if abs(n)>2400:raise ValueError('scroll exceeds2400')
                        if n:send_input(INPUT(type=0,mi=MOUSEINPUT(0,0,n&0xffffffff,flag,0,0)))
                executed.append({'action':kind,'scheduledMs':event.get('atMs',0),'actualMs':round(at,2)})
            self.actions+=len(executed)
        finally:self.release();self.target=None
        self.observations.pop(a.get('observationId'),None);value=self.capture(a['windowId'],mode=a.get('mode','window'));value['execution']={'events':executed,'elapsedMs':round((time.monotonic()-began)*1000,2),'allInputsReleased':not self.held and not self.buttons,'modelCalls':0};return value
    def open_fast(self,hwnd,a):
        self.fast_capture=None
        if a.get('mode','screen')=='screen' and a.get('captureBackend','dxgi')=='dxgi':
            from fast_capture import FastCapture
            self.fast_capture=FastCapture(rect(hwnd))
    def close_fast(self):
        camera=getattr(self,'fast_capture',None)
        value={'backend':'dxgi' if camera else 'gdi-or-printwindow','freshFrames':camera.fresh if camera else None,'reusedFrames':camera.reused if camera else None}
        if camera:
            try:camera.close()
            except Exception as e:value['cleanupError']=str(e)
            finally:self.fast_capture=None
        return value
    def raw_image(self,hwnd,mode):
        self.check(hwnd);r=rect(hwnd)
        if U.IsIconic(hwnd):raise RuntimeError('WINDOW_MINIMIZED')
        if mode not in ['screen','window']:raise ValueError('mode must be screen or window')
        camera=getattr(self,'fast_capture',None)
        if camera:
            if tuple(r)!=camera.bounds:raise RuntimeError('WINDOW_MOVED_OR_RESIZED')
            return camera.read(lambda:self.check(hwnd))
        return screen_region(r) if mode=='screen' else print_window(hwnd,r).convert('RGB')
    def record(self,a):
        import cv2,numpy as np
        hwnd=resolve(a['windowId']);self.check(hwnd);seconds=float(a.get('seconds',5));fps=float(a.get('fps',12))
        if not 0<seconds<=60 or not 1<=fps<=60:raise ValueError('record supports0..60seconds and1..60fps')
        root=Path('E:/LianHome/收件箱/感官采集/屏幕');root.mkdir(parents=True,exist_ok=True);file=root/('window-'+uuid.uuid4().hex+'.mp4');writer=None;stamps=[];self.target=hwnd;began=time.monotonic();wall=time.time();error=None
        try:
            setup=time.monotonic();open_fast(self,hwnd,a);setup_ms=(time.monotonic()-setup)*1000;began=time.monotonic();wall=time.time()
            for i in range(math.ceil(seconds*fps)):
                if time.monotonic()-began>=seconds:break
                self.wait(hwnd,max(0,began+i/fps-time.monotonic()));image=raw_image(self,hwnd,a.get('mode','screen'));image.thumbnail((1280,720));w,h=image.size;w-=w%2;h-=h%2;image=image.crop((0,0,w,h))
                if writer is None:writer=cv2.VideoWriter(str(file),cv2.VideoWriter_fourcc(*'mp4v'),fps,(w,h));assert writer.isOpened()
                elif (w,h)!=(width,height):raise RuntimeError('WINDOW_MOVED_OR_RESIZED')
                width,height=w,h;writer.write(cv2.cvtColor(np.array(image),cv2.COLOR_RGB2BGR));stamps.append(time.monotonic()-began)
        except Exception as e:error=str(e)
        finally:
            capture_stats=close_fast(self)
            if writer:writer.release()
            self.target=None;self.release()
        if not stamps:raise RuntimeError(error or 'No video frames captured')
        value={'file':str(file),'windowId':a['windowId'],'startedAtUnix':wall,'startedAtMonotonicSeconds':began,'frameTimestampBasis':'capture-return-plus-encode; includes capture/encode latency','frameTimesSeconds':stamps,'capture':capture_stats,'actualFreshFPS':capture_stats['freshFrames']/max(.001,time.monotonic()-began) if capture_stats['freshFrames'] is not None else None,'encodedFPS':fps,'capturedFrames':len(stamps),'elapsedSeconds':time.monotonic()-began,'partial':bool(error),'error':error,'audioIncluded':False,'source':'selected-window-region','mode':a.get('mode','screen'),'modelCalls':0,'notice':'仅本次窗口视频采集；实际帧时间记录单独保留，画面可能包含覆盖物；无音频。'};report=file.with_suffix('.json');report.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8');return {**value,'frameTimesSeconds':stamps[:6]+stamps[-6:] if len(stamps)>12 else stamps,'timestampsTruncated':len(stamps)>12,'fullReport':str(report)}
    def follow(self,a):
        import cv2,numpy as np
        hwnd=resolve(a['windowId']);self.check(hwnd);obs=self.observations.get(a.get('observationId'));image=self.template_frames.get(a.get('observationId'))
        if obs is None or image is None:raise RuntimeError('OBSERVATION_EXPIRED: capture a fresh frame')
        x,y,w,h=[int(a[k]) for k in ['x','y','width','height']]
        if not 8<=w<=300 or not 8<=h<=300 or x<0 or y<0 or x+w>image.width or y+h>image.height:raise ValueError('invalid template rectangle')
        template=cv2.cvtColor(np.array(image.crop((x,y,x+w,y+h))),cv2.COLOR_RGB2GRAY);seconds=float(a.get('seconds',3));hz=float(a.get('hz',12));threshold=float(a.get('threshold',.8))
        if float(template.std())<2:raise ValueError('模板缺少纹理，请选择完整且有辨识度的目标')
        if not 0<seconds<=15 or not 1<=hz<=60 or not .5<=threshold<=1:raise ValueError('invalid controller settings')
        began=time.monotonic();self.target=hwnd;trace=[];clicks=0;lastclick=-1;error=None
        try:
            setup=time.monotonic();open_fast(self,hwnd,a);setup_ms=(time.monotonic()-setup)*1000;began=time.monotonic()
            while time.monotonic()-began<seconds:
                tick=time.monotonic();frame=raw_image(self,hwnd,a.get('mode','screen'));frame.thumbnail((1280,1280))
                if frame.size!=image.size:raise RuntimeError('WINDOW_MOVED_OR_RESIZED')
                scores=cv2.matchTemplate(cv2.cvtColor(np.array(frame),cv2.COLOR_RGB2GRAY),template,cv2.TM_CCOEFF_NORMED);_,score,_,pos=cv2.minMaxLoc(scores)
                if not math.isfinite(score) or score<threshold:raise RuntimeError('TARGET_NOT_MATCHED: no blind input')
                cx,cy=pos[0]+w/2,pos[1]+h/2;sx,sy=self.point(hwnd,a.get('observationId'),cx,cy);self.move(hwnd,sx,sy)
                if a.get('click') and time.monotonic()-lastclick>.2:self.button('left',True);self.wait(hwnd,.025);self.button('left',False);lastclick=time.monotonic();clicks+=1
                trace.append({'at':round(time.monotonic()-began,3),'x':cx,'y':cy,'match':round(score,4)});self.wait(hwnd,max(0,1/hz-(time.monotonic()-tick)))
        except Exception as e:error=str(e)
        finally:capture_stats=close_fast(self);self.release();self.target=None
        try:value=self.capture(a['windowId'],mode=a.get('mode','screen'))
        except Exception as e:value={'windowId':a['windowId'],'captureError':str(e)}
        controller={'capture':capture_stats,'trace':trace,'actualHz':len(trace)/max(.001,time.monotonic()-began),'clicks':clicks,'stoppedReason':error,'elapsedSeconds':time.monotonic()-began,'modelCalls':0,'notice':'模板匹配的局部控制器，不是通用游戏智能；分数不证明目标身份正确。'}
        out=Path('E:/LianHome/收件箱/感官采集/屏幕');out.mkdir(parents=True,exist_ok=True);report=out/('controller-'+uuid.uuid4().hex+'.json');report.write_text(json.dumps(controller,ensure_ascii=False,indent=2),encoding='utf-8')
        value['controller']={**controller,'trace':trace[:6]+trace[-6:] if len(trace)>12 else trace,'traceCount':len(trace),'traceTruncated':len(trace)>12,'fullReport':str(report)};return value
    def status(self):
        d=old_status(self);d['capabilities'].update({'dxgiTaskCapture':True,'smoothBatch':True,'relativeMouse':True,'localTemplateController':True,'windowVideoCapture':True,'physicalTakeoverDetection':getattr(self,'takeover_hooks_ready',False)});return d
    def dispatch(self,a):
        if a.get('op')=='control' and a.get('command')=='resume':self.external_interruption=False
        if a.get('op')=='batch':return batch(self,a)
        if a.get('op')=='follow':return follow(self,a)
        if a.get('op')=='record':return record(self,a)
        return old_dispatch(self,a)
    Desktop.__init__,Desktop.capture,Desktop.check,Desktop.dispatch,Desktop.status=init,capture,check,dispatch,status
