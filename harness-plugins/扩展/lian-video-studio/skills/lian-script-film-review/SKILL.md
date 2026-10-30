---
name: lian-script-film-review
description: 检查小涟视频文稿的动机、对白、情节和成片体验，按当前文件版本记录引文或时间点，适用于文稿返工、样段复看和成片自审。
---

先读用户的创作目标与已有批评。依据作品类型审稿，不强加恋爱故事、固定人物关系或某种结局。普通聊天不用这份流程。

文稿关注八方面：想表达什么；人物为何做这件事；前后因果；对白有没有回应对方且符合口语；具体可感的细节；铺垫和结果；节奏；事实、经历、想象的边界。不要用抽象抒情替代行动，不把自己猜测写成实际见闻。朗读对白，删掉解释已知信息和空泛表态。

使用whale_creative_review(action:prepare,stage:script,project:完整路径)生成审稿JSON。每项填写pass/fail/not-applicable、reason；pass引用script.md里的原句作为evidence。确实不适用的维度说明原因。用户指出的缺陷未处理时如实记录userRejectionUnresolved。

成片审八方面：人物一致性、构图字级和安全区、节奏、声音参考一致性、字幕、镜头衔接、混音、整体体验。先用whale_video_render抽帧和technical，再核对实际画面与可用回放，声音用离线校对和真实试听反馈核实；没有直接音频理解通道时不宣称亲耳听过；film审稿里的evidence写观察、time写成片秒数。音乐、静音、无角色作品可以说明对应项不适用。不能根据文件名、代码或ffprobe信息就声称看过听过。

whale_creative_review(action:check,report:审稿JSON完整路径,project:完整路径)只核对记录是否齐全、引文是否存在、审稿是否仍对应当前文件。改稿或重新渲染后应重新prepare，保留旧版作比较。这个工具不判断审美，也不证明独立评审或用户认可。自审写author-self-review，不冒充第三方评审。

本技能是创作工作流，无账号输出权限变更，也不修改已约定的发布和评论规则。

## 台词与画面的顺手核对

小涟选择把对照放在排片前：用whale_film_evidence(action:prepare,rows:[{start:起秒,end:止秒,text:台词,visual:预期画面,motion:是否动作或转场}])建立自己的对照表；也可从subtitleFile导入后再补预期画面。表是计划，不是实际画面证据。

成片后用同一工具action:frames，传plan、file。静态行取代表帧，motion:true取起/中/末相邻时码；按offset/limit分页，独立图片带rowId和秒数，不拼接。对照原话看画面实际发生什么；动作密集处按需要补帧或回放片段，不把三张抽样当连续运动已完整检查。

在返回的film-evidence.json里填写observations的observation，真实看过后才把state改为observed。action:check核对计划、成片和帧哈希，修改后旧证据会失效；填写完整本身不证明判断正确。Remotion工程最后沿用whale_creative_review记录版本、具体位置和理由；其他FFmpeg/Updream路线保留本工具的观察记录及原项目审稿文档，不必搬动原片。

不用手改JSON也可以：action:observe传report和observations:[{rowId:行号字符串,observation:实际看见的事实}]，工具保存中性观察。“三帧都是蓝底”就是有效事实记录，不是审美评分。相同SHA256的帧会共用一个图片附件以省上下文，所有独立帧、时码和引用仍保留；内容相同不等于已经证明画面完全没动。

口播用lian-audio-proofread和whale_audio_check回读，真实听感反馈另记具体版本与时码。普通聊天无需这些表格。以上不新增发布审批、发言频率或自动打分。
