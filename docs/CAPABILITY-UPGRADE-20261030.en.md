# Capability update (2026-10-30)

[中文](能力升级-20261030.md)

This release extends the same 15 plugin/configuration components and adds no mandatory always-on model service.

- Extension bridge 1.1.0 adds whale_capability_find: a small set of tools, examples and actual registration state for a goal. An exact-frame question routes to frame extraction. Registration does not prove every external dependency is ready.
- Continuity 1.4.0 adds bounded query aliases and source excerpt offsets while preserving corrections, provenance and reading receipts.
- whale_task_board preserves reviewed artifact hashes during progress updates; verify detects changed/missing files and unresolved external operations. Stable requestKey values and expectedVersion support safe continuation.
- project / plan / render connect video inputs, shots and actual outputs. Existing renderers perform rendering. Shared inputs must be declared; transitions and global audio may still require full composition.
- feedback distinguishes accepted suggestions from resolved revisions, binding source and revised artifact identities. handoff creates selected text and never sends itself.
- operation / costs separate recorded actual, estimated and unknown costs by currency. Coverage is limited to recorded operations; unknown is not zero.
- Creation handbooks 4.7.0 adds revision and sharing topics for scene/dialogue revision and sharing real activities. These are optional methods rather than a fixed persona or automatic aesthetic scoring.

See [task operations](TASK-OPERATIONS.en.md) for examples.

## Communication policy

Liaison 1.5.1 defaults to Beijing-time off-peak communication: weekdays outside verified Chinese holidays pause model communication at 09:00–12:00 and 14:00–18:00. Other hours, weekends and holidays are allowed. Submission, queued execution and reply forwarding all check time. The 2026 source calendar is in holidays.mjs. Unknown future weekday holidays use the stricter normal weekday window. This is the project's default policy, not a universal provider pricing rule.

To restrict a QQ peer, configure the actual sender and group IDs on qq-bridge. The following numbers are placeholders:

~~~yaml
- id: qq-bridge
  config:
    peerCommunication:
      peerQQ: '100000002'
      groups: ['100000004']
~~~

The configured peer's messages in those groups do not wake the model during peak hours. The bound owner's messages follow existing handling. This is a configured ingress policy rather than a global meter for all QQ activity. Account bindings and chat histories are not distributed.

## Compatibility and validation

Six components now explicitly allow rc.3 OR rc.5 instead of requiring rc.3 exactly: life, toolbox, bili-perception, extension-bridge, creative-workbench and video-studio. Compatibility checks remain enabled. The task ledger uses the host's built-in Node SQLite API; local rc.5 loading and selected tool calls were verified. Other environments still require matching SDK paths and external dependencies.

Local isolated and installed-host checks covered artifact changes, navigation, creation references and an incremental code-video fixture. QQ timing checks used fake messages, with no publication test sent to real accounts. Publication checks cover syntax, example configuration and integrity; they do not establish full compatibility on every machine or artistic quality.

Existing upstream attribution and licenses remain; see [sources and changes](UPSTREAM.en.md).

Liaison 1.5.1 also captures correlated completed-turn final text and actively notifies the fixed liaison chat. QQ echoing is isolated. Mixed-input, interrupted and empty replies are not automatically forwarded; explicit replies remain supported without duplicates.

Navigator 1.1.1 makes the evidence scope explicit: state describes registration, implementationState=not-verified means the implementation version has not been verified, and evidence identifies the current-process tool registry. Registration does not establish updated disk code or external dependency health.

Tool counts describe entry points, not full workflow acceptance. Automatic reply capture permits only the audited lian-memory-bootstrap guidance alongside a mail input; other additional input sources still require attention.
