# 任务、产物与代码视频

这是现有任务板的增量能力；普通聊天不建任务。数据分别存在各自家里。不会自动渲染、发信、上传或调用模型。

## 保存与恢复

先 list/get，更新传当前 expectedVersion。跨重启可能重试的写入同时传稳定 requestKey；相同内容同键只写一次，不同内容同键报冲突。claim 是30分钟写入租约。

update 的 title/status/next/result/verification 是正常任务字段。evidencePaths 只在明确保存一版新产物时传入。普通进度更新保留旧哈希；不能靠重算旧文件哈希把变化悄悄抹掉。恢复时 verify：changed/missing/unreadable 需要实际核对，哈希一致只证明文件版本一致。done需要结果，已有产物不能有未说明的变化，未知外部操作要先核对。旧任务仍可get；外部路径不自动获准。

## 外部操作与费用

operation 的 data 例子：
~~~json
{"id":"upload-v1","kind":"upload","state":"prepared","requestHash":"stable-source-hash"}
~~~
请求前记prepared；发送前记submitted；有确定结果后记succeeded/failed/cancelled。超时或不确定记unknown，先查服务回执；submitted/unknown不得重置prepared来自动重试。消息、上传、模型调用成功需receipt（实际回执或可查路径）。这些状态是调用者记录，插件不冒充服务端确认。

可附 elapsedMs（实际测得）及 cost：
~~~json
{"amount":0.02,"currency":"CNY","kind":"estimate","source":"使用的价格版本及用量来源"}
~~~
未知amount=null；kind为actual或estimate。costs分币种、实价/估算汇总，列未知项。仅覆盖已记录操作，不是全局计费拦截器；订阅用量不自动换算成人民币。

## 代码视频镜头与局部重做

把正文、镜头代码、声音、角色参考等作为明确inputs。公用代码或角色参考要列进所有依赖它的镜头；否则工具无法猜出隐含依赖。

project 的 data：
~~~json
{"fps":24,"durationSeconds":12,"inputs":[{"id":"scene-a","path":"家内绝对路径/scene-a.js","source":"本项目原创代码","license":"本项目自有"}],"shots":[{"id":"s1","start":0,"end":6,"inputs":["scene-a"],"notes":"镜头内的动作与人物变化"}]}
~~~
project为显式保存当前输入快照。plan核对输入/输出，给每个镜头signature和需要重渲染的原因。不改动现有Remotion/Motion Canvas/Blender引擎。

先用现有渲染器导出受影响样段，技术检查和实际看图/听音分别做。完成后render传data={shotId,inputSignature,path}记录实际输出；输入变动时拒收旧signature。镜头间转场、全局音乐、调色或整片时长改变可能需要额外整片合成，plan不保证所有作品都可独立分镜渲染。最终导出仍记录在evidencePaths。

## 协作反馈

feedback 的data={id,sha256,author,note,status,start?,end?,evidence?}。sha256需对应本任务已登记的产物；start/end是原片绝对秒。status取pending/accepted/resolved/dismissed；resolved须写真实修改依据。引用的“已解决”是作者主张，程序不替观众验收。

handoff只生成选定的任务进度、产物版本和未解决反馈，默认1200字符。它不读取全部历史，也不自动寄出。只在用户授权、允许的空闲时段、确有协作内容时用原通信工具发送；对方可以自由回答，不规定措辞，不循环确认。

反馈的accepted只表示同意建议，不表示已改好。resolved须同时给evidence和revisedSha256，目标版本必须已登记；sourceRef可指具体反馈信件或报告。原版sha256、修改后sha256及任务版本分别保留，可更新旧版反馈而不把它冒充新版已采纳。

当 resolved 缺少 evidence 或 revisedSha256 时，工具拒绝本次写入并返回 FEEDBACK_RESOLUTION_EVIDENCE_REQUIRED；当 revisedSha256 没有登记为本任务的产物版本时，返回 FEEDBACK_REVISED_VERSION_UNKNOWN，原反馈状态不变。先登记修订后的产物，再用当前 expectedVersion 提交 resolved。
