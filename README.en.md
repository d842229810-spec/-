# Personal AI Companion Plugins

[中文](README.md) | English

A collection of local plugins for DeepSeek Harness: memory and context continuity, creative and video workbenches, desktop control, research reading, QQ communication, and adapted versions of existing community plugins.

This is a **Windows / DeepSeek Harness 0.2.1-rc.3 source snapshot**, not a universal installer. Some modules depend on the desktop SDK layout and separately configured runtimes.

## Plugin catalog

| Component | Version | Purpose |
| --- | --- | --- |
| [Autonomous learning and budget management](harness-plugins/dafeiyu-life/GUIDE.en.md) | 1.4.5-lian.1 | Lets the assistant study during configured hours and manage an activity budget: for example, research a topic, save source cards, reserve estimated cost before an integrated model call and settle it afterward. |
| [External tool connection configuration](harness-plugins/dafeiyu-toolbox/GUIDE.en.md) | 1.0.2 | Connects the assistant to external tools such as a browser and video processors. MCP is a protocol for calling external tools; this component mainly supplies connection configuration, not the external applications themselves. |
| [Memory, tasks and context continuity](harness-plugins/扩展/lian-continuity/GUIDE.en.md) | 1.3.1 | Helps the assistant continue work: search saved records, inspect original surrounding text, track tasks and save a handoff summary when a chat grows long. |
| [Extension status and memory service bridge](harness-plugins/扩展/lian-extension-bridge/GUIDE.en.md) | 1.0.1 | Checks extension/tool availability and connects the assistant to local memory services such as ReMe. ReMe is installed separately; this plugin does not contain your memory data. |
| [Harness–Codex liaison](harness-plugins/扩展/lian-codex-liaison/GUIDE.en.md) | 1.4.1 | Lets an assistant in Harness exchange messages with a separate Codex session, reply and inspect delivery state, supporting conversations between assistants about a specific task. |
| [Video production and exported-film review](harness-plugins/扩展/lian-video-studio/GUIDE.en.md) | 1.5.2-lian.1 | Creates, previews and exports code-based videos and helps inspect the exported file. It can sample a video into a timestamped image grid and retrieve the original frame for a selected cell. |
| [Creative workbench](harness-plugins/扩展/lian-creative-workbench/GUIDE.en.md) | 1.4.0 | Brings writing, code animation, 3D, design and voice tools into a common workbench so an assistant can move from an idea to the appropriate tool. |
| [Creative methods library](harness-plugins/扩展/lian-creation-handbooks/GUIDE.en.md) | 4.6.1 | Provides creative-method material searchable by topic and chapter, covering storytelling, dialogue, visual design, video direction and project handoff. |
| [Windows desktop observation and control](harness-plugins/扩展/lian-desktop-control/GUIDE.en.md) | 1.5.0 | Lets the assistant list and observe Windows windows via screenshots and, when authorized, operate the mouse and keyboard. It also supports short recordings and audio/video capture. |
| [Web and document reader](harness-plugins/扩展/lian-research-reader/GUIDE.en.md) | 1.0.1 | Helps the assistant read public webpages, PDFs and image material while retaining traceable sources, useful for research or checking a document. |
| [Bilibili perception and operation adapter](harness-plugins/扩展/bili-perception/GUIDE.en.md) | 1.4.0 | Helps analyze Bilibili videos using available subtitles, sampled frames, text recognition and comments, with time-range selection for focused review. |
| [Improved sidebar](harness-plugins/扩展/dsh-better-sidebar/GUIDE.en.md) | 0.28.0-lian.1 | Adds a file sidebar to Harness for browsing, searching and editing workspace files; this modified version also retains recovery records for deletions and overwrites. |
| [Improved QQ bridge](harness-plugins/扩展/dsh-qq-bridge/GUIDE.en.md) | 0.6.2-lian.1 | Connects a Harness assistant to QQ through a separately logged-in QQ backend, supporting private/group messages and configured voice and delivery receipts. |
| [Local workspace manager](harness-plugins/扩展/lian-workspace-manager/GUIDE.en.md) | 1.0.0 | Manages local assistant workspaces: inspect or switch directories, repair session/workspace association and create backups. |
| [Workspace menu](harness-plugins/扩展/lian-workspace-menu/GUIDE.en.md) | 1.1.0 | Adds workspace entry points and a directory-switching menu to the Harness interface, helping users select the directory used by the current chat. |

## Upstream sources and local changes

The sidebar, QQ bridge and parts of Bilibili integration use third-party MIT projects or code; the video overview references an upstream design. See [upstream sources and changes](docs/UPSTREAM.en.md) for each project, reuse scope, local modifications and license.

New to the terminology? See the [beginner’s glossary](docs/GLOSSARY.en.md).

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
