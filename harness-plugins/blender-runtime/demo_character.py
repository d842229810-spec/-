import bpy, math, pathlib, json
from mathutils import Vector
out = pathlib.Path(r'E:/LianHome/工作室/3D工程/三维制作环境验收_20261026')
out.mkdir(parents=True, exist_ok=True)
target = out / '鲸鱼玩偶_绑定示例.blend'
if target.exists():
    raise RuntimeError('验收工程已存在，不覆盖')
if bpy.data.filepath:
    raise RuntimeError('当前有已打开工程；请换空白验收场景，不覆盖用户作品')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for module in ['rigify','node_wrangler','pose_library','io_scene_gltf2','io_scene_fbx']:
    try: bpy.ops.preferences.addon_enable(module=module)
    except Exception as e: print('OPTIONAL_ADDON', module, str(e))
bpy.context.scene.blendermcp_use_polyhaven = True
bpy.ops.wm.save_userpref()
def material(name, color, roughness=.36):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    bsdf=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value=(*color,1);bsdf.inputs['Roughness'].default_value=roughness
    return mat
blue=material('海蓝',(0.035,.28,.58));pale=material('腹部奶白',(.84,.93,.96));dark=material('眼睛',(.009,.023,.045),.18);white=material('眼睛高光',(1,1,1));stage=material('暖色台面',(.74,.79,.75))
parts=[]
def sphere(name,loc,scale,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=20,location=loc)
    obj=bpy.context.object;obj.name=name;obj.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);obj.data.materials.append(mat)
    for p in obj.data.polygons:p.use_smooth=True
    parts.append(obj);return obj
body=sphere('Whale.Body',(0,0,1.9),(1.15,.74,.8),blue)
sphere('Whale.Belly',(0,-.16,1.63),(.96,.66,.45),pale)
tail=sphere('Whale.Tail',(0,1.15,1.85),(.35,.65,.28),blue)
flukes=[]
for side in [-1,1]:
    fin=sphere('Whale.TailFluke.'+str(side),(side*.38,1.55,2),(.55,.3,.18),blue);fin.rotation_euler[1]=side*.25;flukes.append(fin)
    fin=sphere('Whale.Fin.'+str(side),(side*1.03,-.02,1.54),(.5,.32,.14),blue);fin.rotation_euler[1]=side*.45
    eye=sphere('Whale.Eye.'+str(side),(side*.66,-.61,2.02),(.13,.1,.18),dark)
    sphere('Whale.Glint.'+str(side),(side*.64,-.702,2.09),(.035,.025,.05),white)
bpy.ops.object.armature_add(enter_editmode=True,location=(0,0,0));rig=bpy.context.object;rig.name='Whale.Rig'
root=rig.data.edit_bones[0];root.name='Root';root.head=(0,0,1);root.tail=(0,0,2)
bone=rig.data.edit_bones.new('Tail');bone.head=(0,.7,1.9);bone.tail=(0,1.7,1.9);bone.parent=root
bpy.ops.object.mode_set(mode='OBJECT');rig.show_in_front=True
for obj in parts:
    group=obj.vertex_groups.new(name='Tail' if obj is tail or obj in flukes else 'Root');group.add(list(range(len(obj.data.vertices))),1.0,'REPLACE');modifier=obj.modifiers.new('Armature','ARMATURE');modifier.object=rig;obj.parent=rig
for frame,angle in [(1,-.22),(16,.22),(31,-.22),(46,.22),(60,-.22)]:
    rig.pose.bones['Tail'].rotation_mode='XYZ';rig.pose.bones['Tail'].rotation_euler[1]=angle;rig.pose.bones['Tail'].keyframe_insert(data_path='rotation_euler',frame=frame)
    rig.location.z=.06*math.sin(frame/60*math.tau);rig.keyframe_insert(data_path='location',frame=frame)
bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=2.2,depth=.18,location=(0,0,.65));plinth=bpy.context.object;plinth.name='展示台';plinth.data.materials.append(stage)
bevel=plinth.modifiers.new('柔和倒角','BEVEL');bevel.width=.12;bevel.segments=4
bpy.ops.object.camera_add(location=(4.4,-6.8,4.2));camera=bpy.context.object;camera.rotation_euler=(Vector((0,.15,1.65))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=6.0
scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=24
devices=[]
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.get_devices()
    for device in prefs.devices:
        device.use=device.type=='OPTIX';devices.append({'name':device.name,'type':device.type,'enabled':device.use})
    if any(d['enabled'] for d in devices):scene.cycles.device='GPU'
except Exception as e: print('GPU_FALLBACK',str(e))
for name,loc,power,size in [('主光',(2,-4,6),700,4),('轮廓光',(-4,2,4),950,3),('柔光',(0,4,5),500,3)]:
    bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.name=name;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(Vector((0,0,1.7))-light.location).to_track_quat('-Z','Y').to_euler()
scene.world.color=(.16,.2,.25);scene.render.resolution_x=960;scene.render.resolution_y=960;scene.render.resolution_percentage=100;scene.render.fps=30;scene.frame_start=1;scene.frame_end=60
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(out/'preview.png');scene.frame_set(16)
bpy.ops.wm.save_as_mainfile(filepath=str(target))
bpy.ops.render.render(write_still=True)
bpy.ops.export_scene.gltf(filepath=str(out/'鲸鱼玩偶_动画.glb'),export_format='GLB',export_animations=True)
proof={'blender':bpy.app.version_string,'project':str(target),'rig':rig.name,'bones':len(rig.data.bones),'animatedFrames':60,'devices':devices,'addons':{m:m in bpy.context.preferences.addons for m in ['rigify','node_wrangler','pose_library','io_scene_gltf2','io_scene_fbx']},'notice':'原生建模、骨骼、动画与导出验收示例，不是小涟正式鲸鱼娘角色模型。'}
(out/'verification.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(proof,ensure_ascii=False))
