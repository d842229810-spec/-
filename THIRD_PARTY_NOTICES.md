# 第三方来源与许可

本仓库汇集本地适配源码与改进版本，不能将其整体归为从零原创。

| 组件 | 上游/依据 | 保留的声明 |
| --- | --- | --- |
| dsh-better-sidebar | https://github.com/omdsh-dev/DSH-better-sidebar | harness-plugins/扩展/dsh-better-sidebar/LICENSE |
| dsh-qq-bridge | https://github.com/Yuuyuko-uu/dsh-qq-bridge | harness-plugins/扩展/dsh-qq-bridge/LICENSE |
| dafeiyu-life的B站provider | https://github.com/moxingovo/dsh-bilibili ，0.2.4，commit 923d884698bb7b3b9de8a651de970c801bf10d0d | vendor/moxingovo-bilibili/LICENSE 与 UPSTREAM.md |
| bili-perception及vendor | 各vendor目录及原有THIRD_PARTY_NOTICES.md | LICENSE.upstream和各自声明 |
| Remotion/React等npm依赖 | 各运行时package.json与package-lock.json | 按实际安装依赖的许可证 |
| Blender、FFmpeg、ASR、视觉/音频/音乐模型 | 外部软件及其官方发行渠道 | 未附带软件二进制或模型权重，使用者另行核对上游许可 |

许可证与版权声明原样保留。根目录没有为所有组件统一授予MIT许可。部分自定义模块未声明许可证，或声明UNLICENSED；公开可读不等于自动授权任意再分发。需要再分发时按具体文件/模块许可处理。

原有README含历史版本说明与本机验收记录，仓库新使用指南不取代上游版权要求。

逐项原项目、复用范围与本地改进： [中文](docs/上游来源与改动.md) | [English](docs/UPSTREAM.en.md)。视频概览参考 SAOS-3624/dsh-video-storyboard 的设计目标，未复制其运行模块；B站感知还复用了 Sacredbluedragon/dsh-bili-watch 的部分代码，并参考 icyaaaww/dsh-bili-vision 的采样思路，相关许可证分别保存在插件对应目录。
