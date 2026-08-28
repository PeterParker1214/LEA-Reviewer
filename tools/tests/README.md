# Tests

Plain `node`, no framework, no dependencies. Run them from the repository root:

    node tools/tests/manifest-guard.test.js
    node tools/tests/sw-routing.test.js

`manifest-guard.test.js` reads two real versions of `data/subjects.json` out of
this repository's own history — the pair where a module was silently deleted —
and checks the admin page now refuses that write instead of making it.

`sw-routing.test.js` drives the service worker's fetch listener and checks that
`data/subjects.json` is fetched from the network first, while question files
stay cache-first so the site still works offline.
