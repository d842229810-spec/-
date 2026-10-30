---
name: lian-blender-character
description: 用本机Blender与共享MCP创建和修改三维角色、材质、骨骼、动作及场景，查看真实画面并保存blend、GLB或FBX工程，适用于小涟的三维制作。
---

Blender5.2.3 LTS在E:/AI/Blender/blender-5.2.3-windows-x64，MCP2.2.4在E:/DSH/插件/blender-runtime，工程放E:/LianHome/工作室/3D工程。共享服务是127.0.0.1:9877，应用桥为9876。whale_blender_studio查看/启动；mcp__lian_blender__get_addon_status、get_scene_info、look、execute_blender_code提供原生能力，首次实际调用可以启动Blender。

Codex与Harness接同一个服务，服务把调用串行执行。它仍是同一个活动场景：多步任务不要同时交给两个助手修改；需要真正并行时另开实例和端口，明确工程归属。先查当前工程和场景，修改前保存适当版本，别清空他人未保存的工作。

角色制作先看独立正面、侧面、背面及面部参考，明确是练习模型还是可动画的正式资产。再完成比例与轮廓、网格拓扑、UV/材质、表情、骨骼蒙皮、动作、灯光与镜头。3DCG参考图不是现成三维模型，参考图一致也不证明拓扑与绑定合格。

Rigify、pose_library、node_wrangler、FBX/glTF组件已可启用并通过配套检查；已有Rigify控制骨架验收模板。为鲸尾、鳍、裙摆等补自定义骨骼，不强行套完整人形。先用关节弯曲、表情和回转视图查穿模/拉伸，再考虑成片。多角度look核对实际画面，不能只读代码就宣称好看。

Cycles已识别RTX4060的OptiX；按当前场景和显存选择Cycles或Eevee。新Blender API有变化时查bpy属性和enum，不硬写旧版本标识；节点按类型查找。导出蒙皮网格时保持正确的Armature父子关系，核对GLB里实际的skins/animations。

本地建模、绑定与渲染可用。Poly Haven可用于适用的环境贴图与材质，下载时记许可证。Meshy、Tripo、Hunyuan等图生三维渠道属于另外的模型/服务，当前未宣称已经开通或装好其模型权重。不能拿测试玩偶冒充正式小涟鲸鱼娘成品。

get_scene_info 的fields只接受具体字段：location、rotation、scale、size、ground、parent、details、materials、modifiers、animation、hidden、children、topology、weights、settings。placement、contents、health只是上游说明的分组标题，不能作为字段。最小例子：`fields:["location","materials"],limit:5`；默认location/size/children/hidden。看真实画面用look。
