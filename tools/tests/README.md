# Tests

Plain `node`, no framework, no dependencies. Run them from the repository root:

    node tools/tests/manifest-guard.test.js
    node tools/tests/sw-routing.test.js
    node tools/tests/module-order.test.js

`manifest-guard.test.js` reads two real versions of `data/subjects.json` out of
this repository's own history — the pair where a module was silently deleted —
and checks the admin page now refuses that write instead of making it.

`sw-routing.test.js` drives the service worker's fetch listener and checks that
`data/subjects.json` is fetched from the network first, while question files
stay cache-first so the site still works offline.

`module-order.test.js` checks that saving the manifest puts every subject's
modules back in module-number order, including against the live manifest, and
that sorting neither loses a module nor changes anything else.

`subjects-tab.test.js` and `admin-shell.test.js` drive `admin.html` inside a
real DOM, so they need one dependency the other tests do not:

    npm install jsdom
    node tools/tests/subjects-tab.test.js
    node tools/tests/admin-shell.test.js

They boot the page through `lib/admin-dom.js`, which runs both inline script
blocks against a jsdom context and hands back the panel's own bindings.
