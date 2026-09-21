/*
 * Checks assets/chat.js — the lobby/private split, thread grouping and what
 * may be sent. Run: node tools/test-chat.mjs
 */
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import assert from 'node:assert/strict';

runInThisContext(readFileSync(new URL('../assets/chat.js', import.meta.url), 'utf8'));
const C = globalThis.LEAChat;

const ME = 'me', ANA = 'ana', KEV = 'kev';
const msgs = [
  { id: 1, user_id: KEV, to_user: null, body: 'lobby one' },
  { id: 2, user_id: ME,  to_user: ANA,  body: 'to ana' },
  { id: 3, user_id: ANA, to_user: ME,   body: 'from ana' },
  { id: 4, user_id: ME,  to_user: null, body: 'lobby two' },
  { id: 5, user_id: KEV, to_user: ME,   body: 'from kev' }
];

// A lobby message belongs to no thread; a private one belongs to the other person.
assert.equal(C.threadKey(msgs[0], ME), null);
assert.equal(C.threadKey(msgs[1], ME), ANA, 'sent by me — thread is the recipient');
assert.equal(C.threadKey(msgs[2], ME), ANA, 'sent to me — thread is the sender');

// One row per person, newest first, lobby messages left out.
const threads = C.groupThreads(msgs, ME, { [ANA]: 3 });
assert.deepEqual(threads.map(t => t.userId), [KEV, ANA]);
assert.equal(threads[0].unread, true, 'kev wrote last and was never read');
assert.equal(threads[1].unread, false, 'ana read up to message 3');
assert.equal(C.groupThreads(msgs, ME, { [ANA]: 2 })[1].unread, true, 'read state is per message id');

// The lobby is every to_user null message, in order, from anyone.
assert.deepEqual(C.threadMessages(msgs, ME, null).map(m => m.id), [1, 4]);
assert.deepEqual(C.threadMessages(msgs, ME, ANA).map(m => m.id), [2, 3]);

// Empty is not sendable; a picture alone is; whitespace does not count as text.
assert.equal(C.sendable('   ', null), null);
assert.equal(C.sendable('', 'http://x/y.png').body, null);
assert.equal(C.sendable('  hi  ', null).body, 'hi');
assert.equal(C.sendable('x'.repeat(C.BODY_MAX + 1), null), null, 'over the column limit');
assert.equal(C.sendable('x'.repeat(C.BODY_MAX), null).body.length, C.BODY_MAX);

// Only the types the bucket allows, and a GIF has to arrive small enough
// because shrinking one would cost it its animation.
assert.equal(C.imageProblem({ type: 'image/gif', size: 1000 }), null);
assert.ok(C.imageProblem({ type: 'application/pdf', size: 10 }));
assert.ok(C.imageProblem({ type: 'image/gif', size: C.GIF_MAX_BYTES + 1 }));
// An everyday reaction GIF is several MB and goes through untouched.
assert.equal(C.imageProblem({ type: 'image/gif', size: 7 * 1024 * 1024 }), null);
assert.equal(C.needsShrinking({ type: 'image/gif', size: 7 * 1024 * 1024 }), false);
assert.equal(C.GIF_MAX_BYTES, 12 * 1024 * 1024);

// A still picture over the limit is accepted and resized instead.
const big = { type: 'image/png', size: C.IMAGE_MAX_BYTES + 1, name: 'photo.png' };
assert.equal(C.imageProblem(big), null, 'a big photo is not turned away');
assert.equal(C.needsShrinking(big), true);
assert.equal(C.needsShrinking({ type: 'image/png', size: 1000 }), false, 'a small one is sent as it is');
assert.equal(C.needsShrinking({ type: 'image/gif', size: C.GIF_MAX_BYTES + 1 }), false, 'a GIF is never redrawn');
assert.equal(C.IMAGE_MAX_BYTES, 5 * 1024 * 1024);

// A GIF is converted only where the browser can both decode and record.
const able = { ImageDecoder: function(){}, MediaRecorder: Object.assign(function(){}, { isTypeSupported: () => true }) };
const unable = { ImageDecoder: undefined, MediaRecorder: undefined };
assert.equal(C.canMakeVideo(able), true);
assert.equal(C.canMakeVideo(unable), false);
assert.equal(C.canMakeVideo({ ImageDecoder: function(){}, MediaRecorder: Object.assign(function(){}, { isTypeSupported: () => false }) }), false, 'no WebM, no conversion');

assert.equal(C.shouldConvertGif({ type: 'image/gif' }, true), true);
assert.equal(C.shouldConvertGif({ type: 'image/gif' }, false), false, 'Safari sends the GIF as it is');
assert.equal(C.shouldConvertGif({ type: 'image/png' }, true), false, 'a still picture is not a video');

// A sent file that is really a video has to render as one.
assert.equal(C.isVideo('https://x/y/clip.webm'), true);
assert.equal(C.isVideo('https://x/y/clip.webm?v=2'), true);
assert.equal(C.isVideo('https://x/y/photo.jpg'), false);
assert.equal(C.isVideo('https://x/webm/photo.png'), false, 'the extension decides, not the path');
assert.equal(C.isVideo(null), false);

// Read receipts: who has got as far as a given message.
const reads = [
  { user_id: ME,  thread: 'lobby', last_read_id: 4 },
  { user_id: ANA, thread: 'lobby', last_read_id: 4 },
  { user_id: KEV, thread: 'lobby', last_read_id: 1 },
  { user_id: ANA, thread: ANA,     last_read_id: 3 }
];
assert.equal(C.threadName(null), 'lobby');
assert.equal(C.threadName(ANA), ANA);

assert.deepEqual(C.seenBy(reads, 'lobby', 1, ME), [ANA, KEV], 'both got past message 1');
assert.deepEqual(C.seenBy(reads, 'lobby', 4, ME), [ANA], 'kev stopped at 1');
assert.deepEqual(C.seenBy(reads, 'lobby', 5, ME), [], 'nobody has seen the newest one');
assert.deepEqual(C.seenBy(reads, 'lobby', 4, ANA), [ME], 'you never count as having seen your own');

const nameOf = id => ({ ana: 'Ana', kev: 'Kevin' })[id] || id;
assert.equal(C.seenLabel(reads, 'lobby', 4, ME, nameOf), 'Seen by Ana', 'one reader gets a name');
assert.equal(C.seenLabel(reads, 'lobby', 1, ME, nameOf), 'Seen by 2', 'more than one gets a count');
assert.equal(C.seenLabel(reads, 'lobby', 5, ME, nameOf), null, 'nothing to say yet');
assert.equal(C.seenLabel(reads, ANA, 3, ME, nameOf), 'Seen', 'a private thread just says Seen');
assert.equal(C.seenLabel(reads, ANA, 4, ME, nameOf), null);

console.log('chat helpers ok');
