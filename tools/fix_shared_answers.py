"""Stop identically worded questions from marking each other's answers wrong.

Some modules ask the same stem several times with different correct answers
("Which action is tied to a period of 15 days?"). Any answer to that stem must
not appear as a wrong choice in another copy of it. Such choices are swapped
for the answer to a sibling stem ("...120 days?") that is not valid here.
Run from the repo root: python tools/fix_shared_answers.py [--dry]
"""
import collections, glob, json, re, sys


def family(stem):
    # "...period of 15 days (1 month)?" and "...period of 120 days?" are siblings
    s = re.sub(r'\([^)]*\)', '', stem.lower())
    s = re.sub(r'\d[\d,.]*( to \d[\d,.]*| and (below|above|up))?', '#', s)
    return ' '.join(s.split())


def fix(d):
    changes = []
    plain = [q for q in d if isinstance(q, dict) and not q.get('img') and not q.get('scenario')
             and all(isinstance(o, str) for o in q.get('o', []))]
    valid = collections.defaultdict(set)
    fam_keys = collections.defaultdict(collections.Counter)
    for q in plain:
        valid[q['q']].add(q['o'][q['c']])
        fam_keys[family(q['q'])][q['o'][q['c']]] += 1
    for q in plain:
        others = valid[q['q']] - {q['o'][q['c']]}
        for j, o in enumerate(q['o']):
            if o not in others:
                continue
            pool = [k for k, _ in fam_keys[family(q['q'])].most_common()
                    if k not in valid[q['q']] and k not in q['o']]
            if not pool:
                changes.append((q['q'], o, None))  # ponytail: left for a human, no safe swap exists
                continue
            q['o'][j] = pool[0]
            changes.append((q['q'], o, pool[0]))
    return changes


if __name__ == '__main__':
    dry = '--dry' in sys.argv
    for p in sorted(glob.glob('data/*/*.json')):
        raw = open(p, 'rb').read().decode('utf-8')
        d = json.loads(raw.lstrip('﻿'))
        if not isinstance(d, list) or not any(isinstance(q, dict) and 'o' in q for q in d):
            continue
        ch = fix(d)
        if not ch:
            continue
        for stem, old, new in ch:
            print(f'{p} | {stem[:70]} | {old[:50]} -> {new}')
        assert all(None not in q['o'] and len(set(map(str, q['o']))) == len(q['o']) for q in d if isinstance(q, dict) and 'o' in q), p
        if dry:
            continue
        out = json.dumps(d, indent=2, ensure_ascii=False)
        if '\r\n' in raw:
            out = out.replace('\n', '\r\n')
        if raw.endswith('\n'):
            out += '\r\n' if '\r\n' in raw else '\n'
        open(p, 'wb').write((('﻿' if raw.startswith('﻿') else '') + out).encode('utf-8'))
