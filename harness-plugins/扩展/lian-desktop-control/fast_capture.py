"""Task-scoped DXGI capture; coordinates remain tied to selected HWND."""
import time
from PIL import Image
class FastCapture:
 def __init__(self,bounds):
  import dxcam
  self.camera=dxcam.create(device_idx=0,output_idx=0,output_color='RGB',max_buffer_len=2)
  self.bounds=tuple(bounds);self.latest=None;self.fresh=0;self.reused=0
  x,y,r,b=self.bounds
  if not(0<=x<r<=self.camera.width and 0<=y<b<=self.camera.height):
   self.camera.release();raise ValueError('DXGI当前仅支持主显示器内完整窗口；可显式使用原GDI路径')
 def read(self,check):
  end=time.monotonic()+.5
  while True:
   check();frame=self.camera.grab(region=self.bounds,new_frame_only=True)
   if frame is not None:
    self.latest=Image.fromarray(frame);self.fresh+=1;return self.latest.copy()
   if self.latest is not None:self.reused+=1;return self.latest.copy()
   if time.monotonic()>end:raise RuntimeError('DXGI_NO_FRAME')
   time.sleep(.002)
 def close(self):self.camera.release()
