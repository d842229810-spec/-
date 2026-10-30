# Task, artifact and code-video operations

[中文](任务板操作.md)

Use whale_task_board. Ordinary chat does not require a task. Records do not automatically render, upload, send messages or call models.

Read list/get before updating. Use the current expectedVersion and a stable requestKey for replayable writes. Only provide evidencePaths when explicitly registering an artifact version; progress updates preserve previous hashes. verify reports changed, missing and unreadable files. A matching hash establishes identity, not quality.

An operation uses data such as {"id":"upload-v1","kind":"upload","state":"prepared","requestHash":"source-hash"}. Track prepared, submitted and succeeded/failed/cancelled; uncertain outcomes remain unknown until reconciled. Submitted/unknown operations cannot be reset to prepared for automatic retry. Successful external actions require a real receipt. Optional elapsedMs is measured duration. Cost uses {"amount":0.02,"currency":"CNY","kind":"estimate","source":"price and usage reference"}; amount=null is unknown. costs separates currencies and actual/estimated/unknown values.

project data contains fps, durationSeconds, inputs ({id,path,source,license}) and shots ({id,start,end,inputs,notes}). Declare shared dependencies on every affected shot. plan checks current inputs/outputs and returns each shot's inputSignature. Render with an existing renderer, then register the result using render data {shotId,inputSignature,path}. Stale signatures are rejected. Global transitions/audio may require full composition.

feedback data contains id,sha256,author,note,status and optional start/end in absolute source seconds. The source artifact must be registered. accepted means a suggestion was accepted; resolved also requires evidence and a registered revisedSha256. sourceRef can identify the feedback source. Old and revised artifact identities remain separate.

handoff returns selected task state, artifact identity and unresolved feedback, with a default 1200-character budget. It never sends itself. Communication still requires authorization and the permitted time window.

A resolved write without evidence or revisedSha256 is rejected with FEEDBACK_RESOLUTION_EVIDENCE_REQUIRED. An unregistered revisedSha256 is rejected with FEEDBACK_REVISED_VERSION_UNKNOWN, leaving the previous feedback state unchanged. Register the revised artifact first, then submit resolved with the current expectedVersion.
