import bpy, addon_utils, pathlib
root = pathlib.Path(r'E:/DSH/插件/blender-runtime')
addon_utils.modules_refresh()
addon_utils.enable('blender_mcp', default_set=True, persistent=True)
for module in ['rigify', 'node_wrangler', 'pose_library', 'io_scene_gltf2', 'io_scene_fbx']:
    addon_utils.enable(module, default_set=True, persistent=True)
bpy.context.scene.blendermcp_port = 9876
bpy.context.scene.blendermcp_auto_start_server = True
bpy.context.scene.blendermcp_use_polyhaven = True
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type='OPTIX';prefs.get_devices()
    for device in prefs.devices: device.use=device.type=='OPTIX'
    if any(device.use for device in prefs.devices): bpy.context.scene.cycles.device='GPU'
except Exception as error: print('LIAN_GPU_CONFIG', str(error), flush=True)
bpy.ops.wm.save_userpref()
print('LIAN_BLENDER_READY', bpy.app.version_string, flush=True)
