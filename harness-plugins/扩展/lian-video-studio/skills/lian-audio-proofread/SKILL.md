---
name: lian-audio-proofread
description: 校对本地配音或成片中的口播、字幕时码与停顿，复用离线ASR及音量检查；用于疑似漏字错读、字幕错位和配音返工，不用于判断说话人情绪或人格。
---

调用whale_audio_check(action:check,file:本地音频或视频绝对路径,expectedText:这段口播原文)。有SRT/VTT可传subtitleFile；需要局部复查时用start/end秒数。中文默认language:zh，英文en，不确定时auto。默认最多检查5分钟，长片按需分段，返回range明确覆盖范围。

工具在本机CPU用已有Whisper medium int8，不另装模型、不请求云端。相同解码音频和模型配置复用识别结果，重新检查可沿用缓存。报告在E:/LianHome/工作室/创作检查，原作品只读，返回原音频哈希、识别词时码、可能的原文差异、字幕重叠范围、静音区间和音量。transcribe:false只做技术观察。

ASR是识别结果：同音字、数字写法、识别模型本身都可能产生差异，不直接宣布错读。词时码是估计，跨字幕边界的词需复核；不把单次ASR置信值或停顿长短当成审美评分。静音作品或没有口播时不需要强行转写。

Whisper的avg_logprob与no_speech_prob来自解码窗口，多个句段可以共享相同数值；不能用它比较哪句说得更含糊。原始数值只在完整报告保留，简短结果明确这一含义。

先看完整覆盖与sourceUnchanged，再对具体差异回到对应片段。报告可继续读取fullReport；resultTruncated时不能假装已看全部。音色、情感、音乐搭配和好不好听仍需真实试听反馈。记录阿水实际说过的具体反馈、对应音频版本和时码；推测与原话分开，继续复用已有经历记录，不另建人格或记忆库。C正式声线保持原选定配置。
