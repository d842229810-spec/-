---
name: lian-media-library
description: 为小涟的图片和视频检索固定鲸鱼娘参考图、表情动作和声音样本，准备GPT与Updream参考包并保留来源，用于保持人物与声音一致。
---

素材登记表E:/LianHome/工作室/创作素材库/assets.json，原图留在原位置。默认蓝白女仆鲸鱼娘；只管理视觉和声音参考，不重设人格。

1. whale_media_assets(action:search,query:关键词,style:Q萌或3DCG)检索素材，kind:image或audio可筛选。已索引不代表逐张审美验收，选择后看实际图片。
2. 一个角色参考文件只放一张独立图，不做多视图拼图。按镜头选择正面、侧背面、面部、动作和表情，风格保持一致。缺少的场景/道具/表情先到GPT生成；视频前先有需要的资产图。
3. whale_media_assets(action:bundle,project:完整项目路径,ids:素材ID数组)复制参考图和声音到项目references，并写updream-references.json。源文件哈希变化会提示更新索引，避免偷偷沿用不同版本。
4. 当前用户正式选定 C·慵懒机灵（lian-voice-C-20261026）；视频口播、QQ语音均使用 whale_voice / whale_qq_voice 和固定参考音频，不再默认 Day1。旧音频资产保留作为历史资料。每个项目记录 voiceProfile，Updream 使用同一 C 参考音频。
5. 去Updream创作要实际上传文件并将参考绑定到该次任务；manifest的uploadId、boundToTask初始为空和false。只有拿到真实服务回执才能填写，路径与提示词不代表上传成功。
6. 生成后抽帧对照脸、发色、服装、尾巴，再听声音并核对字幕。对生成结果不合格的片段定点返工。保留参考版本、任务标识和成片的对应关系。

本机没有自动安装收费生图、配音或云端视频服务。已有服务工具能否使用，以当次真实连接和任务回执为准。
