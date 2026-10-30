"""Isolated desktop acceptance window, never edits user works."""
import ctypes as C
import json
import os
from pathlib import Path
import sys
import tkinter as tk

try:
    C.windll.user32.SetProcessDpiAwarenessContext(C.c_void_p(-4))
except Exception:
    pass
destination = Path(sys.argv[1])
command_file = destination.with_suffix('.command.json')
root = tk.Tk()
root.title("小涟桌面控制验收 · 独立测试窗口")
root.geometry("660x430+100+100")
root.resizable(False, False)
state = {"clicks": 0, "moves": 0, "drags": 0, "scrolls": 0, "lastKey": "", "text": ""}
label = tk.Label(root, text="小涟的眼睛与手：独立验收窗口", font=("Microsoft YaHei", 16))
label.place(x=20, y=15)
entry = tk.Entry(root, font=("Microsoft YaHei", 12))
entry.place(x=20, y=70, width=500, height=35)
def clicked():
    state["clicks"] += 1
    button.configure(text=f"点击已收到 {state['clicks']}")
button = tk.Button(root, text="点击验收", command=clicked)
button.place(x=20, y=120, width=150, height=40)
canvas = tk.Canvas(root, bg="#153047", highlightthickness=0)
canvas.place(x=20, y=180, width=600, height=200)
fish = canvas.create_oval(35, 65, 75, 105, fill="#66d9f2")
canvas.create_text(300, 25, text="蓝球：按右键移动；可拖动；滚轮计数", fill="white")
def key(event):
    state["lastKey"] = event.keysym
    if event.keysym == "Right":
        state["moves"] += 1
        canvas.move(fish, 8, 0)
def drag(event):
    state["drags"] += 1
    canvas.coords(fish, event.x-20,event.y-20,event.x+20,event.y+20)
def wheel(event):
    state["scrolls"] += 1
canvas.bind("<Button-1>", lambda _e: canvas.focus_set())
canvas.bind("<B1-Motion>", drag)
canvas.bind("<MouseWheel>", wheel)
root.bind("<KeyPress>", key)
def save():
    if command_file.exists():
        try:
            command = json.loads(command_file.read_text(encoding='utf-8'))
            command_file.unlink()
            if command.get('close'):
                root.destroy()
                return
            if command.get('focusAway'):
                secondary = tk.Toplevel(root)
                secondary.title('独立验收失焦目标')
                secondary.geometry('320x120+820+100')
                tk.Label(secondary, text='验证失焦自动释放按键').pack()
                secondary.lift()
                secondary.focus_force()
                secondary.after(1100, secondary.destroy)
        except Exception:
            pass
    root.update_idletasks()
    state["text"] = entry.get()
    origin = [root.winfo_rootx(), root.winfo_rooty()]
    widgets = {}
    for name, widget in (("entry", entry), ("button", button), ("canvas", canvas)):
        widgets[name] = {"center": [widget.winfo_rootx()+widget.winfo_width()//2, widget.winfo_rooty()+widget.winfo_height()//2]}
    hwnd = C.windll.user32.GetAncestor(root.winfo_id(), 2)
    data = {"pid": os.getpid(), "windowId": f"{hwnd:x}:{os.getpid()}", "state": state,
            "widgets": widgets, "origin": origin, "fish": canvas.coords(fish)}
    destination.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    root.after(80, save)
root.after(100, save)
root.after(600000, root.destroy)
root.mainloop()
