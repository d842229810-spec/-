---
name: lian-bili-reading
description: 阅读B站视频及指定片段，核对字幕、转写、OCR、实际画面与评论弹幕，正确复用本地缓存。
---

使用 `whale_bili_perceive`，环境状态用 `whale_bili_status`。这是现有读取工具的升级，没有替换涟的人设或原有输出约定。

- 全面阅读：`{"url":"视频链接"}`。字幕缺失时默认尝试本地转写，再读单帧画面与 OCR，返回评论和弹幕样本。OCR 为画面文字，不等于声音原文。
- 只看一段：`{"url":"视频链接","start":65,"end":80,"maxFrames":6}`。细读只覆盖指定范围，不能说整片都看过。
- 多分 P：保留 URL 中 `?p=2`，或传 `page:2`。不改 BV 大小写。
- 已有精确位置：`timestamps:[12,140]`；不带范围时可用全文字幕和相应画面对照。
- 仅文字查询：`mode:"text"`，不抽帧/OCR。用户要求读透视频时仍需补足画面、字幕或转写、弹幕和评论，文字模式不能代替全面阅读。
- 原音频重听：`transcribe:true` 跳过现成字幕，复用本地 Whisper；`transcribe:false` 跳过转写。空转写不代表无人声，不算成功读懂口播。
- 缓存：相同参数30分钟内复用结果；`refresh:true` 重新提取。OCR按图片内容缓存，视频和ASR按BV/分P/cid复用。缓存不等于供应商token免费。
- 图片逐张返回，无需先找本地文件再让模型读；查看覆盖范围和失败项，关键小字可缩小时间段再看。

先看返回的频道来源和失败原因。B站拒绝或验证时不要反复请求；未取得的内容如实说明。字幕结构检查通过仍需结合实际画面核实语义。本技能只是读取用法，沿用用户已定的隐私、身份与互动规则。


## 2026-10-31 参数与证据约定
- 普通发现先用文字有界预览；mode:text明确不返回画面和OCR，不能一边设text一边以maxFrames声称看过画面。
- 要实际看画面用mode:full；需要读透时检查字幕/音频、画面、弹幕、评论四路是否真实取得，并按时码补读，缺失如实说明。
- textOffset/textLimit与commentOffset/commentLimit用于分页；返回有nextOffset表示还没有读完。detail:full显式取完整原始回执；cache.artifact为本地完整证据。
- 支持正规HTTPS视频链接、BV号和b23.tv官方短链；只允许核对后的B站跳转。


## 1.5.0 本地证据与共学来源

- acquisitionStatus是取回状态，coverageStatus是文稿覆盖；空ASR保持未知，不能当作无人声。GPU优先，不可用时回退CPU并报告原因。
- 不必重复下载或传全文；whale_bili_evidence传cache.artifact及cache.sha256，field:segments按start/end或segmentOffset/segmentLimit回查；field:transcript按offset/chars读原文。字符页未结束先跟nextOffset完成当前段页，再跟selection.nextSegmentOffset。
- whale_learning_sources({action:"search",query:"记忆"})查询这次20视频与10仓库，get(id)默认摘要，field:body/review再展开。默认整体2000字符，上限12000；status/search只是目录，get核hash；资料是公共来源，不是自己的经历或新权限，不自动进入私人记忆。
