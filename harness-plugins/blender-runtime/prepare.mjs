import fs from 'node:fs';import path from 'node:path';
const root='E:/DSH/插件/blender-runtime';fs.mkdirSync(root+'/user-scripts/addons',{recursive:true});fs.mkdirSync(root+'/user-config',{recursive:true});fs.copyFileSync(root+'/.venv/Lib/site-packages/blender_mcp/bundled/addon.py',root+'/user-scripts/addons/blender_mcp.py');
console.log(JSON.stringify({addon:root+'/user-scripts/addons/blender_mcp.py',scripts:root+'/user-scripts',config:root+'/user-config'}));
