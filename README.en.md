# Personal AI Companion Plugins

[中文](README.md) | English

A collection of local plugins for DeepSeek Harness: memory and context continuity, creative and video workbenches, desktop control, research reading, QQ communication, and adapted versions of existing community plugins.

This is a **Windows / DeepSeek Harness 0.2.1-rc.3 source snapshot**, not a universal installer. Some modules depend on the desktop SDK layout and separately configured runtimes.

## Plugin catalog

| Component | Version | Purpose |
| --- | --- | --- |
| [Autonomous learning and budget management](harness-plugins/dafeiyu-life/GUIDE.en.md) | 1.4.5-lian.1 | Schedules autonomous activities, tracks budget reservations and settlement, stores source cards and supports knowledge and Bilibili reading. Cross-process locks and conflict detection protect supported state updates. |
| [External tool connection configuration](harness-plugins/dafeiyu-toolbox/GUIDE.en.md) | 1.0.2 | Connects external browser, FFmpeg and related MCP services. Includes legacy offline TTS helper code. |
| [Memory, tasks and context continuity](harness-plugins/扩展/lian-continuity/GUIDE.en.md) | 1.3.1 | Provides source-backed retrieval, context expansion, task tracking, checkpoints, corrections and receipts describing the text actually returned. |
| [Extension status and memory service bridge](harness-plugins/扩展/lian-extension-bridge/GUIDE.en.md) | 1.0.1 | Reports extension availability, connects a local ReMe service and supports public knowledge search/synchronization. |
| [Harness–Codex liaison](harness-plugins/扩展/lian-codex-liaison/GUIDE.en.md) | 1.4.1 | Supports ask/reply/inbox workflows, dedicated sessions, direct wake-up, source identity, compact envelopes and delivery deduplication. |
| [Video production and exported-film review](harness-plugins/扩展/lian-video-studio/GUIDE.en.md) | 1.5.2-lian.1 | Creates code-video projects; manages assets, previews, rendering, timestamped overview grids, original-frame retrieval, script reviews and audio checks. |
| [Creative workbench](harness-plugins/扩展/lian-creative-workbench/GUIDE.en.md) | 1.4.0 | Coordinates writing practice, Motion Canvas, Blender, OpenDesign, voice and local music adapters. |
| [Creative methods library](harness-plugins/扩展/lian-creation-handbooks/GUIDE.en.md) | 4.6.1 | Reads chapters on narrative, visual design, directing and project handoff, with method data and skill documents. |
| [Windows desktop observation and control](harness-plugins/扩展/lian-desktop-control/GUIDE.en.md) | 1.5.0 | Lists windows and supports screenshots, mouse/keyboard actions, batches, short recordings and synchronized audio/video capture. |
| [Web and document reader](harness-plugins/扩展/lian-research-reader/GUIDE.en.md) | 1.0.1 | Reads public web pages, PDFs and images while retaining information that can be checked against sources. |
| [Bilibili perception and operation adapter](harness-plugins/扩展/bili-perception/GUIDE.en.md) | 1.4.0 | Combines video perception, subtitle/audio information, OCR and platform-operation interfaces with source and observation scope. |
| [Improved sidebar](harness-plugins/扩展/dsh-better-sidebar/GUIDE.en.md) | 0.28.0-lian.1 | Adds a file tree, editing, search and session-workspace UI, with path validation, recovery and write-reliability changes. |
| [Improved QQ bridge](harness-plugins/扩展/dsh-qq-bridge/GUIDE.en.md) | 0.6.2-lian.1 | Connects QQ through OneBot HTTP, including private messages, addressed group routing, receipts and voice follow-up adapters. |
| [Local workspace manager](harness-plugins/扩展/lian-workspace-manager/GUIDE.en.md) | 1.0.0 | Provides directory switching, session-workspace ownership repair, backups and a local management UI. |
| [Workspace menu](harness-plugins/扩展/lian-workspace-menu/GUIDE.en.md) | 1.1.0 | Adds workspace entry points and directory-switching interaction to the Harness frontend. |

## Getting started

1. Read [Installation](docs/INSTALL.en.md) and generate a separate local configuration copy.
2. Select required components with [Dependencies and runtimes](docs/DEPENDENCIES.en.md).
3. Follow [Usage](docs/USAGE.en.md) and each component guide; use the schemas exposed by the actual host.
4. Review [Configuration and privacy](docs/PRIVACY.en.md), [Known limitations](docs/LIMITATIONS.en.md) and [Third-party notices](THIRD_PARTY_NOTICES.md).

## Layout

- harness-plugins/: source and runtime adapters; retain relative directory relationships.
- harness-plugins/扩展/: Harness extension packages.
- docs/: installation, usage, dependencies and scope.
- tools/: local configuration and file-integrity utilities.
- catalog.json: versions of 15 components.
- SHA256SUMS.json: integrity manifest.
