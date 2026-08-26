#!/usr/bin/env python3
"""
Bump the ?v= cache-busting version on every shared asset reference.

Why this exists
---------------
The site is static and has no build step, so pages reference the shared
scripts by plain path. GitHub Pages serves them with `Cache-Control:
max-age=600`, which means for up to ten minutes after a deploy a returning
reader keeps running the PREVIOUS copy of assets/*.js while already loading
the new HTML.

That is normally a cosmetic annoyance. It stopped being cosmetic once
assets/module-progress.js started carrying data-safety fixes: a reader on a
stale copy could still hit the old code path that wiped saved progress after
a failed row fetch. Ten minutes of that is ten minutes too many.

Appending ?v=N makes the URL itself change, so a deploy forces a fresh
fetch immediately instead of waiting out the TTL.

Usage
-----
    python tools/bump-assets.py          # bump to the next version
    python tools/bump-assets.py 7        # set an explicit version
    python tools/bump-assets.py --check  # report current versions, change nothing

Run it whenever you change anything in assets/, before you commit.
"""
import io
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Shared scripts whose staleness actually matters.
ASSETS = ['module-progress', 'quiz-resume', 'theme', 'lea-confirm', 'presence', 'icons', 'sfx']

# Matches assets/<name>.js, optionally already versioned, when followed by a
# quote (a src="…" attribute or a JS string). The trailing-quote anchor is what
# keeps prose mentions in comments from being rewritten.
PATTERN = re.compile(
    r'(assets/(?:%s)\.js)(\?v=\d+)?(?=["\'])' % '|'.join(re.escape(a) for a in ASSETS)
)


def iter_html():
    for root, dirs, files in os.walk(REPO):
        if 'design_handoff_lea_reviewer' in root or '.git' in root or 'tools' in root:
            continue
        for fn in files:
            if fn.endswith('.html'):
                yield os.path.join(root, fn)


def current_versions():
    seen = {}
    for p in iter_html():
        for m in PATTERN.finditer(io.open(p, encoding='utf-8').read()):
            v = int(m.group(2)[3:]) if m.group(2) else 0
            seen[v] = seen.get(v, 0) + 1
    return seen


def main():
    args = [a for a in sys.argv[1:]]

    if '--check' in args:
        seen = current_versions()
        if not seen:
            print('no shared asset references found')
            return
        for v in sorted(seen):
            label = '(unversioned)' if v == 0 else '?v=%d' % v
            print('  %-14s %d reference(s)' % (label, seen[v]))
        return

    seen = current_versions()
    highest = max(seen) if seen else 0
    version = int(args[0]) if args and args[0].isdigit() else highest + 1

    total_refs = 0
    changed_files = 0
    for p in iter_html():
        s = io.open(p, encoding='utf-8').read()
        new_s, n = PATTERN.subn(lambda m: '%s?v=%d' % (m.group(1), version), s)
        if n:
            total_refs += n
        if new_s != s:
            io.open(p, 'w', encoding='utf-8', newline='').write(new_s)
            changed_files += 1

    print('bumped to ?v=%d — %d reference(s) across %d file(s) rewritten'
          % (version, total_refs, changed_files))


if __name__ == '__main__':
    main()
