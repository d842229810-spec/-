# Upstream attribution

Repository: https://github.com/moxingovo/dsh-bilibili
Version: 0.2.4
Commit: 923d884698bb7b3b9de8a651de970c801bf10d0d
License: MIT, retained in LICENSE.
Files reused: lib/provider.js, lib/types.js, lib/wbi.js.

Local changes: provider accepts an injected fetch implementation. The integration
uses the existing bounded, DNS-validated and address-pinned HTTPS transport,
refuses redirects, limits destinations and strips cookies outside the API host.
An anonymous nav response with code -101 is accepted only when it contains the
public WBI key images. Authentication checks on content endpoints are retained.
Player metadata has one compatibility fallback to /x/player/v2 when the signed
player endpoint is unavailable. Both use the same account; failures are reported.
The standalone upstream UI, scheduling, frames and tool registration are not
mounted. No account cookie is imported from the logged-in browser.

The workflow comparison also reviewed c1overzz/dsh-bili-scroll (commit
42cd1c9e7d975fc46cf62bd86024a134c37501d7), YOYOLnFu/dsh-bili-pond and
CZX2244/dsh-bilibili. Those projects are not installed by this integration.
