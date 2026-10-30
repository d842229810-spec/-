"""Read-only cursor telemetry and bounded visual drag feedback. No cloud calls."""
import base64, ctypes as C, io, json, math, threading, time, uuid
from collections import deque
from ctypes import wintypes as W
from pathlib import Path


class CURSORINFO(C.Structure):
    _fields_ = [('cbSize', W.DWORD), ('flags', W.DWORD), ('hCursor', W.HANDLE), ('ptScreenPos', W.POINT)]


def coordinates(sample, obs, current_rect):
    out = dict(sample)
    out['ageMs'] = round(max(0, time.monotonic() - sample['monotonicSeconds']) * 1000, 2)
    out['stale'] = out['ageMs'] > 500
    if not sample['valid'] or obs is None:
        return out
    out['geometryValid'] = obs['rect'] == current_rect and time.time() - obs['created'] < 120
    if not out['geometryValid']:
        out['mappingError'] = 'WINDOW_MOVED_OR_OBSERVATION_EXPIRED: observe again'
        return out
    x, y = sample['screenX'], sample['screenY']
    r = obs.get('imageRect', obs['rect'])
    out['window'] = {'x': x-current_rect[0], 'y': y-current_rect[1]}
    out['image'] = {'x': (x-r[0])*obs['width']/(r[2]-r[0]), 'y': (y-r[1])*obs['height']/(r[3]-r[1]),
                    'inside': r[0] <= x < r[2] and r[1] <= y < r[3]}
    out['observationId'] = obs['id']
    return out


def install(Desktop, api):
    U, resolve, rect, ImageGrab, Image = [api[k] for k in ['U','resolve','rect','ImageGrab','Image']]
    U.GetCursorPos.argtypes = [C.POINTER(W.POINT)]
    U.GetCursorPos.restype = W.BOOL
    U.GetCursorInfo.argtypes = [C.POINTER(CURSORINFO)]
    U.GetCursorInfo.restype = W.BOOL
    old_init, old_capture, old_dispatch, old_status = Desktop.__init__, Desktop.capture, Desktop.dispatch, Desktop.status

    def sample():
        p = W.POINT(); ci = CURSORINFO(); ci.cbSize = C.sizeof(ci)
        C.set_last_error(0); ok = bool(U.GetCursorPos(C.byref(p))); error = C.get_last_error() if not ok else None
        visible_ok = bool(U.GetCursorInfo(C.byref(ci)))
        return {'valid': ok, 'screenX': p.x if ok else None, 'screenY': p.y if ok else None,
                'visible': bool(ci.flags & 1) if visible_ok else None,
                'sampledAtUnix': time.time(), 'monotonicSeconds': time.monotonic(), 'error': error}

    def init(self):
        old_init(self)
        self.cursor_samples = deque(maxlen=100)
        self.cursor_samples.append(sample())
        self.cursor_sample_count = 1
        def run():
            while not self.closed:
                self.cursor_samples.append(sample()); self.cursor_sample_count += 1
                time.sleep(.1)
        self.cursor_watcher = threading.Thread(target=run, daemon=True)
        self.cursor_watcher.start()

    def cursor(self, a=None):
        a = a or {}; obs = None; bounds = None
        if a.get('observationId'):
            obs = self.observations.get(a['observationId'])
            if obs is None: raise RuntimeError('OBSERVATION_EXPIRED: observe again')
            if a.get('windowId') and a['windowId'] != obs['windowId']: raise ValueError('OBSERVATION_WINDOW_MISMATCH')
            bounds = rect(resolve(obs['windowId']))
        elif a.get('windowId'):
            bounds = rect(resolve(a['windowId']))
        result = coordinates(sample(), obs, bounds)
        if bounds and not obs and result['valid']:
            result['window'] = {'x': result['screenX']-bounds[0], 'y': result['screenY']-bounds[1]}
        result['sampler'] = {'running': self.cursor_watcher.is_alive(), 'requestedHz': 10,
            'samplesTaken': self.cursor_sample_count, 'bufferedSamples': len(self.cursor_samples),
            'lastBackgroundSample': coordinates(self.cursor_samples[-1], None, None),
            'retention': 'latest 100 samples in process memory; no idle trajectory file', 'modelCalls': 0,
            'lifetime': 'desktop backend process only; does not wake a model'}
        return result

    def capture(self, *args, **kwargs):
        value = old_capture(self, *args, **kwargs)
        value['cursor'] = cursor(self, {'windowId': value['window']['windowId'], 'observationId': value['observationId']})
        value['cursor']['relationToImage'] = 'sampled after capture, not an atomic video frame; no cursor overlay'
        return value

    def precision(self, a):
        import cv2
        import numpy as np
        hwnd = resolve(a['windowId']); self.check(hwnd)
        oid = a['observationId']; obs = self.observations.get(oid); image = self.template_frames.get(oid)
        if obs is None or image is None: raise RuntimeError('OBSERVATION_EXPIRED: observe again')
        def number(k, default=None):
            v = float(a.get(k, default))
            if not math.isfinite(v): raise ValueError(k+' must be finite')
            return v
        x,y,w,h = [number(k) for k in ['x','y','width','height']]
        if any(v != int(v) for v in (x,y,w,h)): raise ValueError('template rectangle must use integer pixels')
        x,y,w,h = map(int,(x,y,w,h))
        if min(w,h)<12 or max(w,h)>240 or x<0 or y<0 or x+w>image.width or y+h>image.height:
            raise ValueError('template: textured inner object patch, 12..240 pixels, within image')
        gx,gy = number('grabX',x+w/2),number('grabY',y+h/2)
        tx,ty = number('toX'),number('toY')
        tolerance=number('tolerance',2); seconds=number('seconds',8); threshold=number('threshold',.85)
        if not .5<=tolerance<=10 or not .5<=seconds<=12 or not .7<=threshold<=.99: raise ValueError('invalid precision limits')
        start_screen = self.point(hwnd,oid,gx,gy); self.point(hwnd,oid,tx,ty)
        template=cv2.cvtColor(np.asarray(image.crop((x,y,x+w,y+h))),cv2.COLOR_RGB2GRAY)
        if template.std()<8: raise ValueError('TEMPLATE_LOW_TEXTURE: choose a distinctive inner patch')
        r=obs.get('imageRect',obs['rect']); scalex=(r[2]-r[0])/image.width; scaley=(r[3]-r[1])/image.height
        began=time.monotonic(); trace=[]; reason=None; arrived=False; verified_follow=False; self.target=hwnd
        last=(x+w/2,y+h/2); grab_offset=(gx-last[0],gy-last[1]); max_step=32/max(scalex,scaley)

        def check_geometry():
            self.check(hwnd)
            if rect(hwnd)!=obs['rect']: raise RuntimeError('WINDOW_MOVED_OR_RESIZED: released; observe again')
            if time.monotonic()-began>seconds: raise RuntimeError('TIME_LIMIT: released; inspect result')

        def locate(expected):
            check_geometry()
            # Pixel evidence only. Never read game state, DOM positions, or answer coordinates.
            frame=ImageGrab.grab(bbox=tuple(r),all_screens=True).convert('RGB').resize(image.size)
            gray=cv2.cvtColor(np.asarray(frame),cv2.COLOR_RGB2GRAY)
            margin=max(20,int(64/min(scalex,scaley)))
            left=max(0,int(expected[0]-w/2-margin)); top=max(0,int(expected[1]-h/2-margin))
            right=min(image.width,int(expected[0]+w/2+margin)); bottom=min(image.height,int(expected[1]+h/2+margin))
            scores=cv2.matchTemplate(gray[top:bottom,left:right],template,cv2.TM_CCOEFF_NORMED)
            _,score,_,pos=cv2.minMaxLoc(scores)
            if not math.isfinite(score) or score<threshold: raise RuntimeError('OBJECT_NOT_MATCHED: released; reobserve/select a stable inner patch')
            other=scores.copy(); px,py=pos; radius=max(4,min(w,h)//3)
            other[max(0,py-radius):py+radius+1,max(0,px-radius):px+radius+1]=-1
            second=float(other.max())
            if second>threshold and score-second<.04: raise RuntimeError('AMBIGUOUS_TEMPLATE: released; select a unique patch')
            center=(left+pos[0]+w/2,top+pos[1]+h/2)
            return center,score

        def move_checked(ix,iy):
            check_geometry(); sx,sy=self.point(hwnd,oid,ix,iy); self.move(hwnd,sx,sy); self.wait(hwnd,.06)
            current=sample()
            if not current['valid']: raise RuntimeError('CURSOR_UNAVAILABLE: released')
            err=math.hypot(current['screenX']-sx,current['screenY']-sy)
            if err>3: raise RuntimeError('CURSOR_DID_NOT_REACH_TARGET: released; check clipping or interference')
            return {'x':current['screenX'],'y':current['screenY'],'errorPx':round(err,2)}

        try:
            # Reject stale source appearance before pressing; input can alter hover appearance.
            last,score=locate(last)
            if math.hypot(last[0]-(x+w/2),last[1]-(y+h/2))>3: raise RuntimeError('OBJECT_MOVED_SINCE_OBSERVATION: observe again')
            move_checked(gx,gy); self.button('left',True); self.wait(hwnd,.08)
            for step in range(40):
                check_geometry(); dx,dy=tx-last[0],ty-last[1]; distance=math.hypot(dx,dy)
                if distance<=tolerance and verified_follow: arrived=True; break
                if distance<=tolerance: raise RuntimeError('ALREADY_AT_TARGET: no meaningful grab verification; inspect manually')
                # First small movement proves object follows the grabbed point.
                length=min(distance,max_step if verified_follow else 10/max(scalex,scaley))
                delta=(dx*length/distance,dy*length/distance)
                expected=(last[0]+delta[0],last[1]+delta[1])
                actual=move_checked(expected[0]+grab_offset[0],expected[1]+grab_offset[1])
                found,score=locate(expected)
                moved=math.hypot(found[0]-last[0],found[1]-last[1])
                follow_error=math.hypot(found[0]-expected[0],found[1]-expected[1])
                trace.append({'step':step,'objectX':found[0],'objectY':found[1],'match':round(score,4),
                    'cursor':actual,'remainingPx':round(math.hypot(tx-found[0],ty-found[1]),2),'atSeconds':round(time.monotonic()-began,3)})
                if not verified_follow and (moved<length*.4 or follow_error>max(3,length*.6)):
                    raise RuntimeError('GRAB_NOT_CONFIRMED: cursor moved but object did not follow; released; inspect selection/overlay')
                if verified_follow and follow_error>max(4,length*.7): raise RuntimeError('OBJECT_NOT_FOLLOWING: released; inspect constraints or occlusion')
                verified_follow=True; last=found
            if not arrived and math.hypot(tx-last[0],ty-last[1])<=tolerance: arrived=True
            if not arrived: reason='STEP_LIMIT: released; inspect result'
        except Exception as e: reason=str(e)
        finally:
            self.release(); self.target=None; self.observations.pop(oid,None)
        result={'windowId':a['windowId']}
        try: result=self.capture(a['windowId'],mode='screen')
        except Exception as e: result['captureError']=str(e)
        report={'arrivedBeforeRelease':arrived and not reason,'grabFollowVerified':verified_follow,'stoppedReason':reason,
            'grabOffsetImagePixels':grab_offset,'toleranceImagePixels':tolerance,'trace':trace,
            'elapsedSeconds':round(time.monotonic()-began,3),'allInputsReleased':not self.buttons and not self.held,
            'gameSnapVerified':False,'modelCalls':0,
            'notice':'Visible patch tracking only; release screenshot must be inspected for snap. Rotation/occlusion/appearance change may stop matching.'}
        folder=Path('E:/LianHome/收件箱/感官采集/屏幕');folder.mkdir(parents=True,exist_ok=True)
        file=folder/('precision-'+uuid.uuid4().hex+'.json');file.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        result['precision']={**report,'trace':trace[:3]+trace[-3:] if len(trace)>6 else trace,'traceCount':len(trace),'fullReport':str(file)}
        return result

    def status(self):
        v=old_status(self);v['cursor']=cursor(self)
        v['capabilities'].update({'idleCursorSampler':True,'cursorReadWhilePaused':True,'regionObservation':True,'precisionDrag':True})
        return v

    def dispatch(self,a):
        if a.get('op')=='cursor': return cursor(self,a)
        if a.get('op')=='precision-drag': return precision(self,a)
        if a.get('op')=='observe': return self.capture(a['windowId'],a.get('activate',False),a.get('mode','window'),a.get('includeControls',False),region=a.get('region'),max_dimension=a.get('maxDimension',1280))
        return old_dispatch(self,a)
    Desktop.__init__,Desktop.capture,Desktop.status,Desktop.dispatch=init,capture,status,dispatch
