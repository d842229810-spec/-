# Dependencies and runtimes

[中文](依赖与运行时.md) | English

Harness supplies Cordis, dsh-tools, dsh-llm and related SDKs. Several modules resolve SDK files from the desktop application layout; installing a similarly named npm package does not establish compatibility.

| Adapter directory | Purpose | External requirements |
| --- | --- | --- |
| lian-video-runtime | Remotion rendering, atomic output, project template | npm dependencies, rendering browser, FFmpeg |
| sensory-runtime | GPU lease and audio monitoring | Matching local perception services |
| video-perception-runtime | Sequence preparation, tracking, vision client | Vision service and model |
| audio-understanding-runtime | Audio model client | Compatible local audio model service |
| film-study-runtime | Film analysis script | Python/OpenCV dependencies |
| local-asr | Transcription and model preparation | Declared requirements and ASR model |
| voice-design-runtime / index-tts-runtime | Voice clients/adapters | Upstream TTS projects, weights, environment |
| music-runtime | Music client/adapter | Upstream project, weights, environment |
| motion-canvas-runtime | Vector-animation workspace | npm dependencies, FFmpeg |
| blender-runtime | Blender startup, MCP proxy and scripts | Blender, MCP/Python environment, upstream service |
| opendesign-runtime | Service resolution/startup | OpenDesign application and MCP |
| shared-mcp-runtime | MCP dependency declaration | Reinstall declared dependencies |

Only adapter source is distributed. Complete upstream source/source-http projects, model caches, virtual environments, binaries and generated outputs are excluded. Follow the corresponding scripts and upstream instructions.

For memory/tasks start with life and continuity; ReMe is optional. For code video add video-studio, lian-video-runtime and FFmpeg. Add perception/ASR/audio services only when needed. QQ requires its own OneBot backend. Unmodified third-party plugins should be obtained separately from their upstream sources.
