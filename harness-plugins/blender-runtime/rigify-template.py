import bpy, pathlib, json, addon_utils
out=pathlib.Path(r'E:/LianHome/工作室/3D工程/三维制作环境验收_20261026')
target=out/'人形骨架模板.blend'
if target.exists():raise RuntimeError('模板已存在，不覆盖')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
addon_utils.enable('rigify',default_set=True)
bpy.ops.object.armature_human_metarig_add()
metarig=bpy.context.object;metarig.name='Lian.Humanoid.Metarig'
bpy.ops.pose.rigify_generate()
rig=bpy.context.object
proof={'blender':bpy.app.version_string,'metarigBones':len(metarig.data.bones),'generatedRig':rig.name,'generatedBones':len(rig.data.bones),'file':str(target),'notice':'可继续配合角色网格调比例和蒙皮的人形控制骨架，不是完成的角色模型。'}
bpy.ops.wm.save_as_mainfile(filepath=str(target));(out/'rigify-verification.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(proof,ensure_ascii=False))
