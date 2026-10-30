# 1.1.0 整合说明

现有 `whale_bili_perceive` 升级，不额外启动新的B站运营调度、登录端或独立模型。账户、人格、对外输出规则沿用现有配置。

## 来源与改动

- Sacredbluedragon/dsh-bili-watch 0.2.23，commit `b27ef51c5622eb58f5e1f17b865ab4e790495ea4`：复用 normalizeSpeech / verifyAsr 的重复转写检查，保存于 `vendor-watch/asr-quality.mjs`，只增加 export。MIT 原文保留在同目录 LICENSE。没有复制它的整套插件、登录或安装器。
- icyaaaww/dsh-bili-vision 0.2.0，commit `5048affdf38e7b0a519425cb313bb23d956a5f22`：参考 uniform_indices 的首尾覆盖原则作 JS 范围采样，见 evidence.mjs；增加本地时间段筛选和覆盖说明。MIT 保留于 vendor-vision/LICENSE。不是整套 vision API 的移植，也未挂载它的独立付费 run。
- moxingovo/dsh-bilibili：保留已有 provider/types/wbi 复用与本地修复，出处见 `../../dafeiyu-life/vendor/moxingovo-bilibili/UPSTREAM.md`。
- 原 extractor 来源 CZX2244/dsh-bilibili 0.8.0；保留原许可与声明。新增分P选择、合法备用CDN、局部采样、共享媒体/ASR缓存、转写质量检查。
- OCR 使用本机 Windows.Media.Ocr，而非重复安装 RapidOCR。接口参考 Microsoft 的 Windows OCR API；没有额外下载识别权重。

## 当前行为

默认全面阅读会取字幕/按需ASR、抽样画面、OCR、评论与弹幕。可用 start/end 定点复看、page 选择分P、mode:text 仅取文字、refresh 重新提取。结果缓存30分钟，媒体缓存24小时；分P/cid区分媒体，参数不同的抽帧目录独立，防止覆盖旧帧。评论与弹幕缓存是快照，新的互动应显式刷新。

本轮没有移植 watch 的面板，也没有安装 scroll/whale 完整工作流。状态可调用 whale_bili_status，使用方式见随插件注册的 lian-bili-reading 技能。

测试：本地读取整合10项、原功能80项、研究读取8项，QQ私聊/群聊各8组模拟检查；真实 Windows OCR 已识别已下载的公开视频画面。在线B站因当前风控不继续请求，宿主验证使用明确标记的本地公开视频夹具，不冒充在线成功。
