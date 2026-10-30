# Upstream sources and local changes

[中文](上游来源与改动.md)

The items below identify known third-party projects used in this collection. Original authors and license texts are retained. Local versions adapt or improve existing projects or selected code; they are not presented as wholly written from scratch.

## Sidebar: modified upstream project

- Upstream: [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar), MIT; local version 0.28.0-lian.1. [Included license](../harness-plugins/扩展/dsh-better-sidebar/LICENSE).
- Local changes: session-workspace path and link checks, recovery records before deletion or overwrite, serialized modifications within a workspace and rejection of stale saves. This is an application-level control, not an OS sandbox. See [UPGRADE-LIAN.md](../harness-plugins/扩展/dsh-better-sidebar/UPGRADE-LIAN.md).

## QQ bridge: modified upstream project

- Upstream: [Yuuyuko-uu/dsh-qq-bridge](https://github.com/Yuuyuko-uu/dsh-qq-bridge), MIT; local version 0.6.2-lian.1. [Included license](../harness-plugins/扩展/dsh-qq-bridge/LICENSE).
- Local adaptations include group addressing by mention, name or reply; sender provenance and per-turn boundaries; handling receipts; and voice send/receive/follow-up integration. See lib/lian-groups.mjs, lib/lian-receipts.mjs and the voice modules.

## Autonomous learning: reused Bilibili provider code

- Upstream: [moxingovo/dsh-bilibili](https://github.com/moxingovo/dsh-bilibili) 0.2.4, commit 923d884698bb7b3b9de8a651de970c801bf10d0d, MIT. The provider, types and wbi files are reused. [License](../harness-plugins/dafeiyu-life/vendor/moxingovo-bilibili/LICENSE) and [provenance](../harness-plugins/dafeiyu-life/vendor/moxingovo-bilibili/UPSTREAM.md) are included.
- The provider accepts an injected fetch and uses the local bounded transport and compatibility handling. The autonomous activity, budget reservation/settlement and later reliability improvements are local integration, not the entire upstream plugin.

## Bilibili perception: reused code and referenced sampling ideas

- [CZX2244/dsh-bilibili](https://github.com/CZX2244/dsh-bilibili) 0.8.0, MIT: the existing extractor originated there; [license](../harness-plugins/扩展/bili-perception/LICENSE.upstream). Local changes add multi-part selection, alternative CDN handling, interval sampling and media caching.
- [Sacredbluedragon/dsh-bili-watch](https://github.com/Sacredbluedragon/dsh-bili-watch) 0.2.23, commit b27ef51c5622eb58f5e1f17b865ab4e790495ea4, MIT: selected duplicate-transcription/quality checks are reused; [license](../harness-plugins/扩展/bili-perception/vendor-watch/LICENSE). The full upstream plugin is not installed here.
- [icyaaaww/dsh-bili-vision](https://github.com/icyaaaww/dsh-bili-vision) 0.2.0, commit 5048affdf38e7b0a519425cb313bb23d956a5f22: the coverage principle informed a separately implemented interval sampler; [reference license](../harness-plugins/扩展/bili-perception/vendor-vision/LICENSE). This is an idea reference, not a copy of the complete plugin.
- See [integration details](../harness-plugins/扩展/bili-perception/INTEGRATION-20261026.md).

## Video overview: referenced design, independent implementation

- [SAOS-3624/dsh-video-storyboard](https://github.com/SAOS-3624/dsh-video-storyboard), commit a7e4e476625af7a43b34ad5157636b88505faef6, inspired the overview-grid and cell-retrieval design; its [MIT license](../harness-plugins/扩展/lian-video-studio/licenses/dsh-video-storyboard-MIT.txt) is included.
- Local time partitioning, scene selection, image composition and evidence records were implemented independently. Upstream runtime modules, ASR and background-watching state machines were not copied or imported. See [adaptation details](../harness-plugins/扩展/lian-video-studio/OVERVIEW-ADAPTATION.md).

## Creative methods library

The method content was adapted from a Meiyi V4.6.1 project supplied by the maintainer, who confirmed they previously created that agent. The Harness reader is an adapter; the whole body of material is not represented as newly written from scratch.

See [third-party notices](../THIRD_PARTY_NOTICES.md) for license locations and external dependencies, and each component guide for other provenance. Retain original copyright and permission notices when redistributing MIT code.
