import subprocess
start = input('开始时间（北京时间，例如00:00）：').strip()
end = input('结束时间（北京时间，例如05:00）：').strip()
subprocess.run(['E:/AI/codex/node.exe', 'E:/DSH/插件/dafeiyu-life/cli.mjs', 'window', start, end], check=True)
