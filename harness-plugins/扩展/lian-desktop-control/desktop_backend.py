"""Local Windows desktop product backend. JSON lines on stdio; no network listener."""
import atexit
import base64
import ctypes as C
from ctypes import wintypes as W
import io
import json
import os
from pathlib import Path
import sys
import threading
import time
import uuid

from PIL import Image, ImageGrab, ImageStat

sys.stdout.reconfigure(encoding="utf-8")
sys.stdin.reconfigure(encoding="utf-8")
U = C.WinDLL("user32", use_last_error=True)
K = C.WinDLL("kernel32", use_last_error=True)
G = C.WinDLL("gdi32", use_last_error=True)
try:
    U.SetProcessDpiAwarenessContext(C.c_void_p(-4))
except Exception:
    pass

ULONG_PTR = W.WPARAM
class MOUSEINPUT(C.Structure):
    _fields_ = [("dx", W.LONG), ("dy", W.LONG), ("mouseData", W.DWORD), ("dwFlags", W.DWORD), ("time", W.DWORD), ("dwExtraInfo", ULONG_PTR)]
class KEYBDINPUT(C.Structure):
    _fields_ = [("wVk", W.WORD), ("wScan", W.WORD), ("dwFlags", W.DWORD), ("time", W.DWORD), ("dwExtraInfo", ULONG_PTR)]
class HARDWAREINPUT(C.Structure):
    _fields_ = [("uMsg", W.DWORD), ("wParamL", W.WORD), ("wParamH", W.WORD)]
class INPUT_UNION(C.Union):
    _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT), ("hi", HARDWAREINPUT)]
class INPUT(C.Structure):
    _anonymous_ = ("u",)
    _fields_ = [("type", W.DWORD), ("u", INPUT_UNION)]

U.GetForegroundWindow.restype = W.HWND
U.GetAncestor.argtypes = [W.HWND, W.UINT]
U.GetAncestor.restype = W.HWND
U.IsWindow.argtypes = [W.HWND]
U.IsWindowVisible.argtypes = [W.HWND]
U.IsIconic.argtypes = [W.HWND]
U.GetWindowRect.argtypes = [W.HWND, C.POINTER(W.RECT)]
U.GetWindowThreadProcessId.argtypes = [W.HWND, C.POINTER(W.DWORD)]
U.GetWindowTextLengthW.argtypes = [W.HWND]
U.GetWindowTextW.argtypes = [W.HWND, W.LPWSTR, C.c_int]
U.GetClassNameW.argtypes = [W.HWND, W.LPWSTR, C.c_int]
U.SetForegroundWindow.argtypes = [W.HWND]
U.SetForegroundWindow.restype = W.BOOL
U.BringWindowToTop.argtypes = [W.HWND]
U.AttachThreadInput.argtypes = [W.DWORD, W.DWORD, W.BOOL]
U.AttachThreadInput.restype = W.BOOL
K.GetCurrentThreadId.restype = W.DWORD
U.ShowWindow.argtypes = [W.HWND, C.c_int]
U.WindowFromPoint.argtypes = [W.POINT]
U.WindowFromPoint.restype = W.HWND
U.SendInput.argtypes = [W.UINT, C.POINTER(INPUT), C.c_int]
U.SendInput.restype = W.UINT
U.MapVirtualKeyW.argtypes = [W.UINT, W.UINT]
U.GetWindowDC.argtypes = [W.HWND]
U.GetWindowDC.restype = W.HDC
U.ReleaseDC.argtypes = [W.HWND, W.HDC]
U.PrintWindow.argtypes = [W.HWND, W.HDC, W.UINT]
G.CreateCompatibleDC.argtypes = [W.HDC]
G.CreateCompatibleDC.restype = W.HDC
G.CreateCompatibleBitmap.argtypes = [W.HDC, C.c_int, C.c_int]
G.CreateCompatibleBitmap.restype = W.HBITMAP
G.SelectObject.argtypes = [W.HDC, W.HANDLE]
G.SelectObject.restype = W.HANDLE
G.DeleteObject.argtypes = [W.HANDLE]
G.DeleteDC.argtypes = [W.HDC]
G.GetDIBits.argtypes = [W.HDC, W.HBITMAP, W.UINT, W.UINT, W.LPVOID, W.LPVOID, W.UINT]
K.OpenProcess.argtypes = [W.DWORD, W.BOOL, W.DWORD]
K.OpenProcess.restype = W.HANDLE
K.QueryFullProcessImageNameW.argtypes = [W.HANDLE, W.DWORD, W.LPWSTR, C.POINTER(W.DWORD)]
K.CloseHandle.argtypes = [W.HANDLE]

ENUMPROC = C.WINFUNCTYPE(W.BOOL, W.HWND, W.LPARAM)
U.EnumWindows.argtypes = [ENUMPROC, W.LPARAM]
U.EnumChildWindows.argtypes = [W.HWND, ENUMPROC, W.LPARAM]

def text(hwnd):
    buf = C.create_unicode_buffer(min(U.GetWindowTextLengthW(hwnd) + 1, 4096))
    U.GetWindowTextW(hwnd, buf, len(buf))
    return buf.value

def rect(hwnd):
    r = W.RECT()
    if not U.GetWindowRect(hwnd, C.byref(r)):
        raise RuntimeError("WINDOW_RECT_FAILED")
    return [r.left, r.top, r.right, r.bottom]

def pid_of(hwnd):
    pid = W.DWORD()
    U.GetWindowThreadProcessId(hwnd, C.byref(pid))
    return pid.value

def executable(pid):
    h = K.OpenProcess(0x1000, False, pid)
    if not h:
        return None
    try:
        buf = C.create_unicode_buffer(32768)
        size = W.DWORD(len(buf))
        return buf.value if K.QueryFullProcessImageNameW(h, 0, buf, C.byref(size)) else None
    finally:
        K.CloseHandle(h)

def info(hwnd):
    pid = pid_of(hwnd)
    return {"windowId": f"{int(hwnd):x}:{pid}", "title": text(hwnd), "pid": pid,
            "executable": executable(pid), "rect": rect(hwnd), "minimized": bool(U.IsIconic(hwnd)),
            "foreground": U.GetForegroundWindow() == hwnd}

def root_window(hwnd):
    return U.GetAncestor(hwnd, 2) or hwnd

def foreground_state(hwnd):
    fg = U.GetForegroundWindow()
    return {"targetHwnd": hex(int(hwnd)), "targetRootHwnd": hex(int(root_window(hwnd))),
            "foregroundHwnd": hex(int(fg or 0)), "foregroundRootHwnd": hex(int(root_window(fg) or 0)) if fg else None,
            "sameRoot": bool(fg and root_window(fg) == root_window(hwnd)), "foregroundPid": pid_of(fg) if fg else None}

def resolve(window_id):
    try:
        handle, pid = window_id.split(":")
        hwnd = int(handle, 16)
        if U.IsWindow(hwnd) and pid_of(hwnd) == int(pid):
            return hwnd
    except (ValueError, AttributeError):
        pass
    raise RuntimeError("WINDOW_NOT_FOUND: use whale_desktop_windows again")

def windows():
    found = []
    @ENUMPROC
    def cb(hwnd, _):
        if U.IsWindowVisible(hwnd) and text(hwnd):
            try:
                found.append(info(hwnd))
            except Exception:
                pass
        return True
    U.EnumWindows(cb, 0)
    return found

def controls(hwnd):
    result = []
    @ENUMPROC
    def cb(child, _):
        if len(result) >= 100:
            return False
        if U.IsWindowVisible(child):
            buf = C.create_unicode_buffer(256)
            U.GetClassNameW(child, buf, len(buf))
            result.append({"class": buf.value, "text": text(child), "rect": rect(child)})
        return True
    U.EnumChildWindows(hwnd, cb, 0)
    return result

class BITMAPINFOHEADER(C.Structure):
    _fields_ = [("biSize", W.DWORD), ("biWidth", W.LONG), ("biHeight", W.LONG),
                ("biPlanes", W.WORD), ("biBitCount", W.WORD), ("biCompression", W.DWORD),
                ("biSizeImage", W.DWORD), ("biXPelsPerMeter", W.LONG), ("biYPelsPerMeter", W.LONG),
                ("biClrUsed", W.DWORD), ("biClrImportant", W.DWORD)]

def print_window(hwnd, bounds):
    width, height = bounds[2] - bounds[0], bounds[3] - bounds[1]
    if not 0 < width <= 16384 or not 0 < height <= 16384 or width * height > 40000000:
        raise ValueError("WINDOW_TOO_LARGE_OR_EMPTY")
    screen = U.GetWindowDC(hwnd)
    memory = G.CreateCompatibleDC(screen)
    bitmap = G.CreateCompatibleBitmap(screen, width, height)
    if not screen or not memory or not bitmap:
        if bitmap: G.DeleteObject(bitmap)
        if memory: G.DeleteDC(memory)
        if screen: U.ReleaseDC(hwnd, screen)
        raise RuntimeError("CAPTURE_ALLOCATION_FAILED")
    previous = G.SelectObject(memory, bitmap)
    try:
        if not U.PrintWindow(hwnd, memory, 2):
            raise RuntimeError("PRINT_WINDOW_FAILED: try mode=screen")
        G.SelectObject(memory, previous)
        previous = None
        header = BITMAPINFOHEADER()
        header.biSize = C.sizeof(header)
        header.biWidth, header.biHeight = width, -height
        header.biPlanes, header.biBitCount = 1, 32
        pixels = C.create_string_buffer(width * height * 4)
        if G.GetDIBits(memory, bitmap, 0, height, pixels, C.byref(header), 0) != height:
            raise RuntimeError("CAPTURE_PIXELS_FAILED")
        return Image.frombytes("RGB", (width, height), pixels.raw, "raw", "BGRX")
    finally:
        if previous: G.SelectObject(memory, previous)
        G.DeleteObject(bitmap)
        G.DeleteDC(memory)
        U.ReleaseDC(hwnd, screen)

def send_input(item):
    if U.SendInput(1, C.byref(item), C.sizeof(INPUT)) != 1:
        raise RuntimeError("SEND_INPUT_FAILED: target may have higher integrity level")

ALIASES = {"CTRL": 0x11, "CONTROL": 0x11, "ALT": 0x12, "SHIFT": 0x10,
           "ENTER": 0x0D, "RETURN": 0x0D, "TAB": 9, "SPACE": 0x20,
           "ESC": 0x1B, "ESCAPE": 0x1B, "BACKSPACE": 8, "DELETE": 0x2E,
           "LEFT": 0x25, "UP": 0x26, "RIGHT": 0x27, "DOWN": 0x28,
           "HOME": 0x24, "END": 0x23, "PAGEUP": 0x21, "PAGEDOWN": 0x22,
           "INSERT": 0x2D, "WIN": 0x5B, "WINDOWS": 0x5B}
EXTENDED = {0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2D, 0x2E, 0x5B}

def key_code(name):
    name = name.strip().upper()
    if name in ALIASES:
        return ALIASES[name]
    if len(name) == 1 and name.isascii() and name.isalnum():
        return ord(name)
    if name.startswith("F") and name[1:].isdigit() and 1 <= int(name[1:]) <= 24:
        return 0x6F + int(name[1:])
    raise ValueError(f"UNSUPPORTED_KEY: {name}")

class Desktop:
    def __init__(self):
        self.paused = False
        self.stop_reason = None
        self.held = set()
        self.buttons = set()
        self.lock = threading.RLock()
        self.observations = {}
        self.closed = False
        self.target = None
        self.stop_file = Path(sys.argv[1]) if len(sys.argv) > 1 else None
        self.actions = 0
        self.started = time.time()
        self.watcher = threading.Thread(target=self.watch, daemon=True)
        self.watcher.start()
        atexit.register(self.release)

    def keyboard(self, vk, down):
        with self.lock:
            if down and self.paused:
                raise RuntimeError("CONTROL_PAUSED: resume explicitly")
            scan = U.MapVirtualKeyW(vk, 0)
            flags = 8 | (1 if vk in EXTENDED else 0) | (0 if down else 2)
            # Scan-code input works for many games that ignore Unicode text events.
            send_input(INPUT(type=1, ki=KEYBDINPUT(0, scan, flags, 0, 0)))
            if down:
                self.held.add(vk)
            else:
                self.held.discard(vk)

    def button(self, name, down):
        flags = {"left": (2, 4), "right": (8, 16), "middle": (32, 64)}[name]
        with self.lock:
            if down and self.paused:
                raise RuntimeError("CONTROL_PAUSED")
            send_input(INPUT(type=0, mi=MOUSEINPUT(0, 0, 0, flags[0 if down else 1], 0, 0)))
            if down:
                self.buttons.add(name)
            else:
                self.buttons.discard(name)

    def release(self):
        with self.lock:
            for vk in list(self.held):
                try:
                    self.keyboard(vk, False)
                except Exception:
                    pass
            for name in list(self.buttons):
                try:
                    self.button(name, False)
                except Exception:
                    pass

    def pause(self, reason="tool"):
        with self.lock:
            self.paused = True
            self.stop_reason = reason
            if self.stop_file:
                self.stop_file.write_text(json.dumps({"reason": reason, "pid": os.getpid()}) if reason == "plugin-unload" else reason, encoding="utf-8")
            self.release()

    def watch(self):
        was_down = False
        while not self.closed:
            with self.lock:
                if self.stop_file and self.stop_file.exists() and not self.paused:
                    try:
                        marker = json.loads(self.stop_file.read_text(encoding="utf-8"))
                    except Exception:
                        marker = None
                    if not (isinstance(marker, dict) and marker.get("reason") == "plugin-unload" and marker.get("pid") != os.getpid()):
                        self.pause("plugin-unload" if isinstance(marker, dict) and marker.get("reason") == "plugin-unload" else "local-stop-signal")
            down = bool(U.GetAsyncKeyState(0x77) & 0x8000)
            if down and not was_down:
                self.pause("F8")
            was_down = down
            if (self.held or self.buttons) and self.target and not foreground_state(self.target)["sameRoot"]:
                self.pause("target-lost-focus")
            time.sleep(0.02)

    def check(self, hwnd):
        if self.paused:
            raise RuntimeError(f"CONTROL_PAUSED: {self.stop_reason}")
        if not U.IsWindow(hwnd):
            raise RuntimeError("WINDOW_NOT_FOUND: 目标窗口已关闭，请重新枚举窗口；没有执行输入。")
        if not foreground_state(hwnd)["sameRoot"]:
            raise RuntimeError("TARGET_NOT_FOREGROUND: 目标不在前台，没有执行输入；请显式调用 observe(activate=true) 或 activate，若Windows拒绝切换，可手动点击目标后重试。 " + json.dumps(foreground_state(hwnd)))

    def focus(self, hwnd):
        if self.paused:
            raise RuntimeError("CONTROL_PAUSED: resume explicitly")
        if not U.IsWindow(hwnd):
            raise RuntimeError("WINDOW_NOT_FOUND: 目标窗口已关闭，请重新枚举。")
        hwnd = root_window(hwnd)
        attempts = []
        if U.IsIconic(hwnd):
            U.ShowWindow(hwnd, 9)
            attempts.append({"action": "restore"})
        if not foreground_state(hwnd)["sameRoot"]:
            attempts.append({"action": "SetForegroundWindow", "returned": bool(U.SetForegroundWindow(hwnd))})
            time.sleep(0.15)
        if not foreground_state(hwnd)["sameRoot"]:
            current = K.GetCurrentThreadId()
            fg = U.GetForegroundWindow()
            threads = {U.GetWindowThreadProcessId(hwnd, None)}
            if fg:
                threads.add(U.GetWindowThreadProcessId(fg, None))
            attached = []
            try:
                for thread in threads - {current, 0}:
                    ok = bool(U.AttachThreadInput(current, thread, True))
                    attempts.append({"action": "AttachThreadInput", "thread": thread, "returned": ok})
                    if ok: attached.append(thread)
                U.BringWindowToTop(hwnd)
                attempts.append({"action": "SetForegroundWindow-after-attach", "returned": bool(U.SetForegroundWindow(hwnd))})
                time.sleep(0.15)
            finally:
                for thread in reversed(attached): U.AttachThreadInput(current, thread, False)
        state = foreground_state(hwnd)
        if not state["sameRoot"]:
            raise RuntimeError("ACTIVATION_REFUSED: 已尝试恢复、激活与临时输入线程连接，Windows仍未允许目标成为前台；没有发送鼠标或文字。请手动点击目标窗口后重试；安全桌面或更高权限窗口可能无法控制。 " + json.dumps({"state": state, "attempts": attempts}))
        return {"state": state, "attempts": attempts, "activated": True}

    def capture(self, window_id, activate=False, mode="window", include_controls=False, region=None, max_dimension=1280):
        hwnd = resolve(window_id)
        activation = self.focus(hwnd) if activate else None
        if U.IsIconic(hwnd):
            raise RuntimeError("WINDOW_MINIMIZED: use activate=true")
        bounds = rect(hwnd)
        if mode == "screen":
            self.check(hwnd)
            image = ImageGrab.grab(bbox=tuple(bounds), all_screens=True)
            capture_method = "visible-screen-crop"
        elif mode == "window":
            image = print_window(hwnd, bounds)
            capture_method = "PrintWindow"
        else:
            raise ValueError("mode must be window or screen")
        # Whole-window physical coordinates, scaled exactly once for model input.
        if image.size != (bounds[2] - bounds[0], bounds[3] - bounds[1]):
            raise RuntimeError("CAPTURE_GEOMETRY_MISMATCH: retry using screen mode")
        image = image.convert("RGB")
        if not isinstance(max_dimension, int) or not 256 <= max_dimension <= 1280:
            raise ValueError("maxDimension must be 256..1280; use a region for full-resolution detail")
        image_bounds = list(bounds)
        if region is not None:
            if not isinstance(region, dict) or any(not isinstance(region.get(k), int) for k in ('x','y','width','height')):
                raise ValueError('region requires integer physical window pixels x,y,width,height')
            x,y,w,h = [region[k] for k in ('x','y','width','height')]
            if x<0 or y<0 or w<16 or h<16 or x+w>image.width or y+h>image.height:
                raise ValueError('REGION_OUTSIDE_WINDOW')
            image=image.crop((x,y,x+w,y+h))
            image_bounds=[bounds[0]+x,bounds[1]+y,bounds[0]+x+w,bounds[1]+y+h]
        image.thumbnail((max_dimension, max_dimension))
        buf = io.BytesIO()
        image.save(buf, format="PNG")
        oid = uuid.uuid4().hex
        stamp = {"id": oid, "windowId": window_id, "rect": bounds,
                 "imageRect": image_bounds, "width": image.width, "height": image.height, "created": time.time()}
        self.observations = {k: v for k, v in self.observations.items() if time.time() - v["created"] < 120}
        self.observations[oid] = stamp
        warning = "capture appears nearly uniform; inspect image, try screen mode for black/blank content" if max(ImageStat.Stat(image).stddev) < 2 else None
        return {"observationId": oid, "window": info(hwnd), "width": image.width, "height": image.height,
                "imageRect": image_bounds, "coordinateSpace": "returned-image-pixels", "capturedAt": time.time(), "captureMethod": capture_method,
                "warning": warning, "activation": activation, "canInputNow": foreground_state(hwnd)["sameRoot"] and not self.paused,
                "controls": controls(hwnd) if include_controls else [],
                "pngBase64": base64.b64encode(buf.getvalue()).decode("ascii")}

    def point(self, hwnd, oid, x, y):
        obs = self.observations.get(oid)
        if not obs or obs["windowId"] != info(hwnd)["windowId"] or time.time() - obs["created"] > 120:
            raise RuntimeError("OBSERVATION_EXPIRED: observe again")
        if obs["rect"] != rect(hwnd):
            raise RuntimeError("WINDOW_MOVED_OR_RESIZED: observe again")
        if not 0 <= x < obs["width"] or not 0 <= y < obs["height"]:
            raise ValueError("POINT_OUTSIDE_IMAGE")
        r = obs.get("imageRect", obs["rect"])
        sx = r[0] + round(x * (r[2] - r[0]) / obs["width"])
        sy = r[1] + round(y * (r[3] - r[1]) / obs["height"])
        owner = U.GetAncestor(U.WindowFromPoint(W.POINT(sx, sy)), 2)
        if owner != hwnd:
            raise RuntimeError("POINT_OCCLUDED: another window covers this point")
        return sx, sy

    def move(self, hwnd, x, y):
        self.check(hwnd)
        vx, vy = U.GetSystemMetrics(76), U.GetSystemMetrics(77)
        vw, vh = U.GetSystemMetrics(78), U.GetSystemMetrics(79)
        dx = round((x - vx) * 65535 / max(vw - 1, 1))
        dy = round((y - vy) * 65535 / max(vh - 1, 1))
        send_input(INPUT(type=0, mi=MOUSEINPUT(dx, dy, 0, 0xC001, 0, 0)))

    def wait(self, hwnd, duration):
        end = time.monotonic() + duration
        while time.monotonic() < end:
            self.check(hwnd)
            time.sleep(min(0.02, max(end - time.monotonic(), 0)))

    def act(self, a):
        hwnd = resolve(a["windowId"])
        self.check(hwnd)
        self.target = hwnd
        kind = a["action"]
        hold = float(a.get("holdMs", 60))
        if not 0 <= hold <= 5000:
            raise ValueError("holdMs must be 0..5000; observe between short bursts")
        try:
            if kind in ("click", "move", "drag", "scroll"):
                sx, sy = self.point(hwnd, a.get("observationId"), a["x"], a["y"])
                self.move(hwnd, sx, sy)
                if kind == "click":
                    count = int(a.get("count", 1))
                    if count not in (1, 2):
                        raise ValueError("count must be 1 or 2")
                    for _ in range(count):
                        self.button(a.get("button", "left"), True)
                        self.wait(hwnd, 0.035)
                        self.button(a.get("button", "left"), False)
                        self.wait(hwnd, 0.06)
                elif kind == "drag":
                    tx, ty = self.point(hwnd, a.get("observationId"), a["toX"], a["toY"])
                    self.button(a.get("button", "left"), True)
                    duration = max(0.15, hold / 1000)
                    steps = max(2, int(duration / 0.02))
                    for i in range(1, steps + 1):
                        self.move(hwnd, round(sx + (tx - sx) * i / steps), round(sy + (ty - sy) * i / steps))
                        self.wait(hwnd, duration / steps)
                    self.button(a.get("button", "left"), False)
                elif kind == "scroll":
                    for field, flag in (("scrollY", 0x800), ("scrollX", 0x1000)):
                        amount = int(a.get(field, 0))
                        if abs(amount) > 2400:
                            raise ValueError("scroll delta must be -2400..2400")
                        if amount:
                            self.check(hwnd)
                            send_input(INPUT(type=0, mi=MOUSEINPUT(0, 0, amount & 0xFFFFFFFF, flag, 0, 0)))
            elif kind == "key":
                keys = [key_code(k) for k in a["key"].split("+")]
                if not keys:
                    raise ValueError("key required")
                for vk in keys:
                    self.check(hwnd)
                    self.keyboard(vk, True)
                self.wait(hwnd, hold / 1000)
            elif kind == "type":
                value = a["text"]
                if len(value) > 4000:
                    raise ValueError("type text must be <=4000 characters per action")
                raw = value.encode("utf-16-le")
                for at in range(0, len(raw), 2):
                    self.check(hwnd)
                    code = int.from_bytes(raw[at:at + 2], "little")
                    send_input(INPUT(type=1, ki=KEYBDINPUT(0, code, 4, 0, 0)))
                    send_input(INPUT(type=1, ki=KEYBDINPUT(0, code, 6, 0, 0)))
            else:
                raise ValueError("unknown action")
            self.actions += 1
        finally:
            self.release()
            self.target = None
        time.sleep(0.12)
        # Consume the old observation; the returned fresh image is the next action's basis.
        self.observations.pop(a.get("observationId"), None)
        return self.capture(a["windowId"], mode=a.get("mode", "window"))

    def status(self):
        return {"backend": "win32-stdio", "pid": os.getpid(), "paused": self.paused,
                "stopReason": self.stop_reason, "heldKeys": len(self.held), "heldButtons": len(self.buttons),
                "actions": self.actions, "emergencyPause": "F8", "networkListeners": 0,
                "capabilities": {"capture": True, "realMouseKeyboard": True, "foregroundIdentity": "HWND-root-with-PID-revalidation", "explicitActivation": True, "backgroundInput": False, "secureDesktop": False, "higherIntegrityWindows": "may-be-denied-by-Windows", "note": "截图成功不证明激活或输入成功；输入仅对经复核的实际前台目标。"},
                "inputStructureBytes": C.sizeof(INPUT), "uptimeSeconds": round(time.time() - self.started)}

    def dispatch(self, a):
        op = a.get("op")
        if op == "status":
            return self.status()
        if op == "windows":
            return {"windows": windows(), "status": self.status()}
        if op == "observe":
            return self.capture(a["windowId"], a.get("activate", False), a.get("mode", "window"), a.get("includeControls", False))
        if op == "act":
            return self.act(a)
        if op == "control":
            if a["command"] in ("pause", "release"):
                self.pause(a["command"])
            elif a["command"] == "resume":
                with self.lock:
                    self.release()
                    if self.stop_file:
                        self.stop_file.unlink(missing_ok=True)
                    self.paused = False
                    self.stop_reason = None
            else:
                raise ValueError("unknown control command")
            return self.status()
        raise ValueError("unknown op")

def main():
    d = Desktop()
    try:
        for line in sys.stdin:
            try:
                request = json.loads(line)
                value = d.dispatch(request)
                response = {"id": request.get("id"), "ok": True, "result": value}
            except Exception as error:
                d.release()
                response = {"id": locals().get("request", {}).get("id"), "ok": False, "error": str(error)}
            print(json.dumps(response, ensure_ascii=False), flush=True)
    finally:
        d.closed = True
        d.release()

from desktop_extensions import install as install_extensions
install_extensions(Desktop, globals())
from cursor_precision import install as install_cursor_precision
install_cursor_precision(Desktop, globals())

if __name__ == "__main__":
    main()
