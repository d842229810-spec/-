"""One local upstream MCP server, shared by Harness and Codex."""
import asyncio, os, pathlib, socket, subprocess, time, json
from contextlib import asynccontextmanager
os.environ['BLENDER_MCP_DISABLE_TELEMETRY']='1'
from blender_mcp.server import mcp
from mcp.types import CallToolRequest
ROOT=pathlib.Path(r'E:/DSH/插件/blender-runtime')
BLENDER=r'E:/AI/Blender/blender-5.2.3-windows-x64/blender.exe'

@asynccontextmanager
async def metadata_lifespan(server):
    # Stateless HTTP starts a lifespan for each request. Metadata must not try a
    # blocking Blender socket handshake; actual tool calls initialize it below.
    yield {}
mcp._mcp_server.lifespan=metadata_lifespan
def listening(port):
    try:
        with socket.create_connection(('127.0.0.1',port),timeout=.5):return True
    except OSError:return False
def ensure_blender():
    if listening(9876):return
    env=os.environ.copy();env.update(BLENDER_USER_SCRIPTS=str(ROOT/'user-scripts'),BLENDER_USER_CONFIG=str(ROOT/'user-config'))
    startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
    with open(ROOT/'blender.log','ab') as log:
        child=subprocess.Popen([BLENDER,'--python',str(ROOT/'bootstrap.py')],env=env,stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW,startupinfo=startup)
    (ROOT/'process.json').write_text(json.dumps({'pid':child.pid,'executable':BLENDER,'startedAt':time.time()}),encoding='utf-8')
    for _ in range(120):
        if listening(9876):return
        if child.poll() is not None:raise RuntimeError('Blender exited; see blender.log')
        time.sleep(.5)
    raise RuntimeError('Blender startup timeout; see blender.log')
lock=asyncio.Lock()
original=mcp._mcp_server.request_handlers[CallToolRequest]
async def serialized_call(request):
    async with lock:
        await asyncio.to_thread(ensure_blender)
        return await original(request)
mcp._mcp_server.request_handlers[CallToolRequest]=serialized_call
mcp.settings.host='127.0.0.1';mcp.settings.port=9877;mcp.settings.streamable_http_path='/mcp';mcp.settings.stateless_http=True
if __name__=='__main__':mcp.run(transport='streamable-http')
