import bpy, pathlib, json
out=pathlib.Path(r'E:/LianHome/工作室/3D工程/三维制作环境验收_20261026')
expected=out/'鲸鱼玩偶_绑定示例.blend'
if pathlib.Path(bpy.data.filepath)!=expected: raise RuntimeError('仅处理本次验收工程')
rig=bpy.data.objects.get('Whale.Rig')
for obj in bpy.data.objects:
    if obj.type=='MESH' and any(m.type=='ARMATURE' and m.object==rig for m in obj.modifiers):
        matrix=obj.matrix_world.copy();obj.parent=rig;obj.matrix_world=matrix
bpy.ops.wm.save_as_mainfile(filepath=str(expected))
bpy.ops.export_scene.gltf(filepath=str(out/'鲸鱼玩偶_动画.glb'),export_format='GLB',export_animations=True)
scene=bpy.context.scene;scene.cycles.samples=8;scene.render.resolution_x=512;scene.render.resolution_y=512
frames=out/'animation-frames';frames.mkdir(exist_ok=True)
for index,frame in enumerate(range(1,61,5),1):
    scene.frame_set(frame);scene.render.filepath=str(frames/f'frame-{index:04d}.png');bpy.ops.render.render(write_still=True)
print('LIAN_ANIMATION_FRAMES_DONE',flush=True)
