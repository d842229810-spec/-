# 个人创作的养鱼插件

中文 | [English](README.en.md)

面向 DeepSeek Harness 的本地插件合集，包含记忆与上下文续接、创作与视频工作台、桌面观察控制、网页阅读、QQ通信，以及已有插件的改进版本。

这是 **Windows / DeepSeek Harness 的源码快照与适配项目**（以 0.2.1-rc.3 为基础，已补充本机 rc.5 适配与加载核验），不是所有版本都可直接使用的应用安装包。部分模块保留SDK布局和外部运行时依赖，安装前请先配置路径。

本次更新：增加按目的找工具、任务产物版本核验、代码视频镜头依赖、版本反馈和费用记录；升级记录及使用例子见[能力升级说明](docs/能力升级-20261030.md)。仍为原有 15 个模块的增量更新。

## 插件清单

| 插件 | 版本 | 主要用途 |
| --- | --- | --- |
| [自主学习与预算管理](harness-plugins/dafeiyu-life/使用指南.md) | 1.4.5-lian.1 | 让助手在设定的时间里自主学习，并管理活动预算：例如按主题查资料、保存来源卡片；调用已接入的模型前预留费用，结束后按回执结算。 |
| [外部工具连接配置](harness-plugins/dafeiyu-toolbox/使用指南.md) | 1.0.2 | 把助手连接到浏览器、视频处理等外部工具。MCP 是让助手调用外部工具的连接协议；这个模块主要保存连接方式，不会替你安装所有外部软件。 |
| [记忆、任务与上下文续接](harness-plugins/扩展/lian-continuity/使用指南.md) | 1.4.0 | 保存记忆、任务和产物版本，核对文件变化与未知投递；关联代码视频镜头、版本反馈和操作费用，便于可靠续接。 |
| [扩展状态与记忆服务桥](harness-plugins/扩展/lian-extension-bridge/使用指南.md) | 1.1.1 | 按目的找工具和少量用法，查看真实注册状态，并连接 ReMe 等另行配置的本地记忆服务。 |
| [Harness与Codex双向通信](harness-plugins/扩展/lian-codex-liaison/使用指南.md) | 1.5.1 | 让 Harness 与独立 Codex 会话双向通信；正常最终正文按消息和回合自动回传，保留回执与空闲时段检查。 |
| [视频项目、渲染与成片核对](harness-plugins/扩展/lian-video-studio/使用指南.md) | 1.5.2-lian.1 | 用代码创建、预览和导出视频，并检查导出的成片；可把一段视频抽成带时间标记的画面宫格，再点回某一张原帧。 |
| [创作工作台](harness-plugins/扩展/lian-creative-workbench/使用指南.md) | 1.4.0 | 把写作、代码动画、三维制作、设计和声音工具放到统一工作台，方便助手从构思进入不同创作工具。 |
| [创作方法库](harness-plugins/扩展/lian-creation-handbooks/使用指南.md) | 4.7.0 | 按主题和章节读取故事、对白、视觉、导演方法；新增场景修订和真实日常分享参考。 |
| [Windows桌面观察与控制](harness-plugins/扩展/lian-desktop-control/使用指南.md) | 1.5.0 | 让助手在 Windows 桌面列出窗口、截图观察，并在获得授权后操作鼠标键盘；还提供短时录制与音画采集能力。 |
| [网页与文档阅读](harness-plugins/扩展/lian-research-reader/使用指南.md) | 1.0.1 | 帮助助手读取公开网页、PDF 文档和图片资料，并整理可回查的来源，适合查资料或核对文章内容。 |
| [B站视频感知与操作适配](harness-plugins/扩展/bili-perception/使用指南.md) | 1.4.0 | 协助分析 B 站视频：结合可取得的字幕、抽样画面、文字识别及评论等资料，按时间段查找和复看内容。 |
| [侧栏改进版本](harness-plugins/扩展/dsh-better-sidebar/使用指南.md) | 0.28.0-lian.1 | 给 Harness 增加文件侧栏：查看工作区文件、搜索和编辑；此改进版还为删除、覆盖等操作提供恢复记录。 |
| [QQ通信改进版本](harness-plugins/扩展/dsh-qq-bridge/使用指南.md) | 0.6.2-lian.2 | 把 Harness 助手接到 QQ：通过已登录的 QQ 后端收发私聊或群消息，并在相关配置下处理语音和消息回执。 |
| [本地工作区管理](harness-plugins/扩展/lian-workspace-manager/使用指南.md) | 1.0.0 | 管理助手的本地工作目录：查看或切换工作区，修正会话与目录的归属，并提供备份操作。 |
| [工作区菜单](harness-plugins/扩展/lian-workspace-menu/使用指南.md) | 1.1.0 | 在 Harness 界面提供工作区入口和切换菜单，帮助用户选择当前聊天使用哪个目录。 |

## 上游来源与本地改进

侧栏、QQ桥与部分B站功能使用了第三方 MIT 项目或代码；视频概览参考了上游设计思路。每项的原项目、复用范围、本地改进和许可证见[上游来源与改动](docs/上游来源与改动.md)。

看不懂缩写或术语，可以先查[新手术语表](docs/新手术语表.md)。

## 从这里开始

1. 阅读[安装指南](docs/安装指南.md)，在独立目录生成本地路径副本。
2. 根据[依赖与运行时](docs/依赖与运行时.md)选择需要的模块。
3. 对照[使用指南](docs/使用指南.md)与每个插件目录里的使用说明、skills和实际工具参数使用。
4. 安装前查看[隐私与配置](docs/隐私与配置.md)、[已知限制](docs/已知限制.md)和[第三方来源](THIRD_PARTY_NOTICES.md)。

## 仓库结构

```text
harness-plugins/          插件源码与必要适配层，保留相对目录关系
  扩展/                  Harness扩展包
  dafeiyu-life/           自主学习、预算和来源管理
  lian-video-runtime/     代码视频渲染运行时
docs/                    安装、操作、依赖与限制
tools/                   本地副本配置与发布完整性检查
catalog.json             15个插件的版本清单
SHA256SUMS.json           文件完整性清单
```
