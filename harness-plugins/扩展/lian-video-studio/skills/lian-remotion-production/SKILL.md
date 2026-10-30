---
name: lian-remotion-production
description: 在小涟的固定本地Remotion环境中制作、预览、抽帧和导出代码视频，连接GPT参考图与Updream片段，适用于视频创作和渲染故障排查。
---

用现成的本地制作环境，不必每次重新安装框架。环境为Remotion 4.0.538、React 19.3.1、Chrome和FFmpeg。

1. 先明确这次作品的观感、观众、长度和交付格式。故事与对白沿用creation-handbooks，可用whale_creation_read读取literature、video、visual章节；不要把技术演示误当故事佳作。
2. 用lian-script-film-review打磨文稿，用lian-media-library确认人物、服装与声音。先制作缺少的角色和场景参考图，所有参考图独立成文件。
3. whale_video_project(action:create,name:项目名)创建项目，默认在E:/LianHome/工作室/Remotion影片。它不会覆盖同名项目。修改项目src/index.jsx和video.props.json来创作，不改已有原作品。
4. 在Remotion里使用帧驱动的interpolate、spring、Sequence以及音频时间轴。字体、颜色、构图、运动速度服务内容，不是装饰越多越好。项目模板只是可运行起点。
5. 正式调Updream时，使用creation-handbooks与资产包，把实际参考图、同一声音参考上传并绑定到该生成任务，记录真实上传标识。whale_media_assets(action:bundle)只准备本地参考包，不能证明云端绑定。
6. 先做有代表性的短样段，再扩成全片。whale_video_render(action:preview,project:完整路径)启动可视时间轴；action:frames返回实际图片，times是秒数数组；action:render导出out/preview.mp4；action:technical检查编码、时长、字幕时间、黑帧及音量。用户明确要求成片时可以直接渲染，无须添加额外确认步骤。
7. 查看实际帧和可用回放；声音用离线校对与真实试听反馈核实，没有直接音频理解通道时不能宣称亲耳听过。依照视频长度、镜头变化与关键转折选择抽帧，抽样不等于看完全片。普通静音作品无需强配旁白；有对白时核对口型、字幕和声音一致性。

项目共享固定node_modules，已写package.json；本地npm run studio也可启动预览。工具whale_video_status返回实际运行状态。

台词—镜头对照与带时码抽样可用whale_film_evidence，工作顺序见lian-script-film-review。口播/字幕回读用whale_audio_check与lian-audio-proofread，复用本地ASR。每次检查看原文件哈希和实际覆盖范围，原片改动后不要沿用旧结论。

官方细节按需读技能remotion-create、remotion-markup、remotion-render、remotion-captions、remotion-multimedia、remotion-interactivity、remotion-studio，或用whale_video_reference(topic:技能名,file:相对文档路径)。上游文字中的跨技能REFERENCE.md在本适配里对应各技能的SKILL.md；不代表每个第三方示例依赖已安装。遇到额外包需求先检查现有依赖。
