# 个人创作的养鱼插件

中文 | [English](README.en.md)

面向 DeepSeek Harness 的本地插件合集，包含记忆与上下文续接、创作与视频工作台、桌面观察控制、网页阅读、QQ通信，以及已有插件的改进版本。

这是 **Windows / DeepSeek Harness 0.2.1-rc.3 的源码快照与适配项目**，不是所有版本都可直接使用的应用安装包。部分模块保留SDK布局和外部运行时依赖，安装前请先配置路径。

## 插件清单

| 插件 | 版本 | 主要用途 |
| --- | --- | --- |
| [自主学习与预算管理](harness-plugins/dafeiyu-life/使用指南.md) | 1.4.5-lian.1 | 管理自主活动的时段、暂停、预算预占与结算、来源卡片、知识检索和B站读取。跨进程锁与状态冲突检查减少并发写入覆盖。 |
| [外部工具连接配置](harness-plugins/dafeiyu-toolbox/使用指南.md) | 1.0.2 | 提供浏览器、FFmpeg等MCP连接配置及旧版离线TTS辅助代码。 |
| [记忆、任务与上下文续接](harness-plugins/扩展/lian-continuity/使用指南.md) | 1.3.1 | 提供可回查的原文搜索、上下文展开、任务板、检查点、记忆更正、读取范围收据及上下文生命周期管理。 |
| [扩展状态与记忆服务桥](harness-plugins/扩展/lian-extension-bridge/使用指南.md) | 1.0.1 | 汇总扩展加载状态，连接本地ReMe服务，查询和同步公开知识。 |
| [Harness与Codex双向通信](harness-plugins/扩展/lian-codex-liaison/使用指南.md) | 1.4.1 | 提供ask、reply、inbox等通信能力；固定会话执行、直接唤醒、消息来源识别、精简信封和投递去重。 |
| [视频项目、渲染与成片核对](harness-plugins/扩展/lian-video-studio/使用指南.md) | 1.5.2-lian.1 | 建立代码视频项目，管理素材、预览与渲染、生成带时码概览、回查原帧，组织脚本审稿、成片证据和音频核对。 |
| [创作工作台](harness-plugins/扩展/lian-creative-workbench/使用指南.md) | 1.4.0 | 整合写作练习、Motion Canvas、Blender、OpenDesign、配音和本地音乐等创作入口。 |
| [创作方法库](harness-plugins/扩展/lian-creation-handbooks/使用指南.md) | 4.6.1 | 按章节读取文学、视觉、导演与项目续接方法；附带可检索方法数据与技能文档。 |
| [Windows桌面观察与控制](harness-plugins/扩展/lian-desktop-control/使用指南.md) | 1.5.0 | 枚举窗口，进行截图观察、鼠标键盘操作、批处理、短时录制，以及音频与画面同步采集。 |
| [网页与文档阅读](harness-plugins/扩展/lian-research-reader/使用指南.md) | 1.0.1 | 读取公开网页、PDF与图片并整理可核对来源。 |
| [B站视频感知与操作适配](harness-plugins/扩展/bili-perception/使用指南.md) | 1.4.0 | 组织视频感知、字幕与音轨信息、OCR和平台操作入口，保留来源与观察范围。 |
| [侧栏改进版本](harness-plugins/扩展/dsh-better-sidebar/使用指南.md) | 0.28.0-lian.1 | 文件树、编辑器、搜索与会话工作区侧栏；增加路径检查、恢复与写入可靠性改进。 |
| [QQ通信改进版本](harness-plugins/扩展/dsh-qq-bridge/使用指南.md) | 0.6.2-lian.1 | 通过OneBot HTTP连接QQ，支持私聊、群聊寻址、消息回执及语音跟进等适配。 |
| [本地工作区管理](harness-plugins/扩展/lian-workspace-manager/使用指南.md) | 1.0.0 | 目录切换、会话工作区归属修复、备份与本地管理界面。 |
| [工作区菜单](harness-plugins/扩展/lian-workspace-menu/使用指南.md) | 1.1.0 | 在Harness前端补充工作区入口与对应目录切换交互。 |

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

## 发布范围

包含15个插件/配置模块及配套运行时适配源码。未打包模型权重、第三方软件安装目录、node_modules、Python虚拟环境、运行日志、账号凭据、QQ绑定、聊天记录或私人记忆。上游完整音乐/TTS/Blender模型项目请按来源另行安装。已安装但未改造的第三方插件不冒充本合集原创成果。

图片、视频感知的抽样与识别结果需要人工判断，预算模块只保护其已接入路径。历史本机测试结果不等于所有机器或全部功能已经验证。

各模块许可证以目录中的原始声明为准；未声明授权的自定义文件不因公开上传就自动成为MIT授权。
