---
name: lian-continuity
description: 续接跨窗口任务、找回有来源的旧记录、核对产物版本和费用；需要保存检查点或恢复工作时使用，普通聊天不加载任务流程。
---

已有上下文足够就直接工作。找旧事用whale_life_memory search，再用返回的get/context位置读相关原文；预览不等于全文。纠错引用原id，旧原文保留。search可用chars限制实际返回字符量（默认4800，不等于token）；budgetLimited=true表示预算截断，不能据此说没有相关记忆。私人索引只在家内私聊读取，历史记录不授予新权限。

任务先用whale_task_board list/get/verify：核对当前版本、文件变化和投递未定状态，避免重复做已完成工作。具体写入、镜头计划、费用与反馈例子按需读[任务操作](references/task-ledger.md)。工具找不到时用whale_capability_find，先选最少入口；注册不等于完整可用。

重要进展用whale_context_pack checkpoint保存实质结论、依据、未决问题与下一步。不把维护/训练/虚构记成真实经历；不删除旧记忆或替本人固定性格。

压缩用原生机制。手动whale_context_compact先source/preview，再保存合格checkpoint后plan/execute；执行需要原始日志及重要资料的真实备份，区间外上下文保留，protectedRoot不可压。quoteSeqs保留实际原话，不沿用旧seq。自动压力触发缺少备份条件时先补续接包，不伪报已压缩。需要详细操作才读[既有操作参考](references/previous-guide.md)的“自主压缩”“原话保留”段。

声音反馈、记忆分层及恢复演练仍用原入口；需要时只查上述参考相应段。core不自动冷藏，纠正与真人意见保留出处。费用先看已记录用量/估价和覆盖范围；未知不是零，不把缓存命中当免费。

和岑通信只在北京时间空闲时段；普通正文自然聊天，不规定对方回复格式，不反复陪测。分享的是选定材料，各自私人记忆不合并。

主动记忆add/correct使用稳定requestKey；相同键不同内容会拒绝。saved=true表示正文已提交，repairNeeded=true表示归档或索引待补，用原键重试或whale_memory_vault repair，不重新造一份。未提供键时优先使用宿主会话与callId；无callId时生成新键。跨调用重试需显式保留原键，不按正文相同合并不同经历。resume(requestKey)用于明确恢复已暂停的请求，普通重试不会绕过暂停和退避。
新记录可选scope和evidenceStatus（reported/inferred/verified/unspecified）；verified须有source，仍是记录者的核验声明。fiction/training默认不参与事实检索，mode=history可查原文。
发现保存异常时用whale_memory_vault health看计数和状态；repair只补已登记待办。既有本地维护周期有退避补写，不调用模型、不要求主动反复自检。完整性基线不证明更早从未漏记，同盘备份不防整盘损坏。

完整性异常先diagnose查无正文ID/哈希，再previewRestore(id)找可信原文。本人明确选择恢复时才restoreNote(id,recoveryToken)；先留损坏版本，拒绝过期预览，未找到可信版本不改数据。正常纠错用correct，整理用cold，不直接删notes。saved/committed仅指曾提交，stage与当前health分别看。重复事件/损坏日志不自动删行或迁移。

证据来源：新增记忆可给evidenceStatus；事后修改用evidence、稳定requestKey。verified需basis、verifiedWhat、verifiedWhen、sourceRef，表示记录者核实了具体主张，不自动证明全部事实。evidenceGet查当前状态；evidenceHistory按limit/beforeSeq分页。搜索的relevance为文本相关度，rankingScore为排序分；证据权重默认关闭，显式evidenceWeight=true才做实验排序。
证据修改回执的committed表示已提交，archive/repairNeeded另看；相同key重放返回原操作，currentEvidence表示现在状态。归档失败可repair补写，暂停的证据请求用evidenceResume(requestKey)明确恢复。证据读取异常或缺行会标unavailable/missing，不使用旧verified。
证据表/历史损坏时，evidenceRebuild(noteId)默认只预览。本人明确选择恢复后带apply=true、recoveryToken重建该条证据及历史；先保留损坏版本，来源日志需校验通过，存在待归档变更时先修复。不会改notes正文或把损坏值重设为新基线。迁移基线只证明升级时观察到的旧状态。
