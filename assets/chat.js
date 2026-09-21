/*
 * Chat helpers — the parts with rules in them, kept away from the DOM so
 * they can be checked by tools/test-chat.mjs.
 *
 * One table holds both kinds of message (see design_handoff_lea_reviewer/
 * chat-setup.sql): to_user null is the lobby, to_user set is a private
 * thread between two people. Everything here is about telling those apart.
 */
(function (root) {
  'use strict';

  var BODY_MAX = 1000;
  var IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  var IMAGE_MAX_BYTES = 5 * 1024 * 1024;
  // A GIF is sent as it arrives, so its ceiling is the one people actually
  // meet. Six or seven MB is an ordinary reaction GIF.
  // ponytail: a bigger allowance, not a smarter one. If storage fills, the
  // upgrade is converting a GIF to WebM in the page (ImageDecoder frames
  // through MediaRecorder), which is five to ten times smaller.
  var GIF_MAX_BYTES = 12 * 1024 * 1024;
  var SHRINK_EDGE = 1600;   // longest side after shrinking — plenty for a phone screen

  /** The other person in this message's thread, or null for the lobby. */
  function threadKey(msg, meId) {
    if (!msg || msg.to_user == null) return null;
    return msg.user_id === meId ? msg.to_user : msg.user_id;
  }

  /**
   * Private messages grouped into one row per person, newest first.
   * `seen` maps a person's id to the id of the last message you read from
   * them, so a thread counts as unread when it ends on someone else's
   * newer message.
   */
  function groupThreads(messages, meId, seen) {
    seen = seen || {};
    var byPerson = new Map();
    (messages || []).forEach(function (m) {
      var who = threadKey(m, meId);
      if (who == null) return;
      var prev = byPerson.get(who);
      if (!prev || m.id > prev.last.id) byPerson.set(who, { userId: who, last: m });
    });
    return Array.from(byPerson.values())
      .map(function (t) {
        t.unread = t.last.user_id !== meId && Number(seen[t.userId] || 0) < Number(t.last.id);
        return t;
      })
      .sort(function (a, b) { return b.last.id - a.last.id; });
  }

  /** The messages of one thread, oldest first. `who` null means the lobby. */
  function threadMessages(messages, meId, who) {
    return (messages || [])
      .filter(function (m) { return threadKey(m, meId) === who; })
      .sort(function (a, b) { return a.id - b.id; });
  }

  /** What may be sent: trimmed text within the limit, or a picture, or both. */
  function sendable(body, imageUrl) {
    var text = String(body == null ? '' : body).trim();
    if (text.length > BODY_MAX) return null;
    if (!text && !imageUrl) return null;
    return { body: text || null, image_url: imageUrl || null };
  }

  /**
   * Why this file cannot be sent, or null when it can.
   *
   * A still picture over the limit is not refused — shrinkToFit() below
   * makes it fit. A GIF is, because redrawing one through a canvas keeps
   * the first frame and throws the animation away, which is worse than
   * saying no.
   */
  function imageProblem(file) {
    if (!file) return 'No file.';
    if (IMAGE_TYPES.indexOf(file.type) === -1) return 'Pictures and GIFs only.';
    if (file.type === 'image/gif' && file.size > GIF_MAX_BYTES) {
      return 'That GIF is over 12 MB. A GIF cannot be shrunk without losing the animation.';
    }
    return null;
  }

  /** True when this file has to go through shrinkToFit() before it is sent. */
  function needsShrinking(file) {
    return !!file && file.type !== 'image/gif' && file.size > IMAGE_MAX_BYTES;
  }

  /**
   * A picture redrawn small enough to send: longest side capped, then JPEG
   * quality stepped down until it fits. Returns the original file when it
   * already fits, and throws when the browser cannot decode it.
   *
   * ponytail: quality is stepped rather than solved for — three or four
   * draws of a phone photo, which is faster than it is worth optimising.
   */
  function shrinkToFit(file, limit, edge) {
    limit = limit || IMAGE_MAX_BYTES;
    edge = edge || SHRINK_EDGE;
    if (!needsShrinking(file)) return Promise.resolve(file);

    return createImageBitmap(file).then(function (bitmap) {
      var scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();

      var qualities = [0.85, 0.7, 0.55, 0.4];
      var step = function (i) {
        return new Promise(function (resolve) {
          canvas.toBlob(resolve, 'image/jpeg', qualities[i]);
        }).then(function (blob) {
          if (!blob) throw new Error('This picture could not be resized.');
          if (blob.size <= limit || i === qualities.length - 1) {
            return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
          }
          return step(i + 1);
        });
      };
      return step(0);
    });
  }

  /** "9:14 AM" for today, "14 Sep" before that. */
  function shortTime(iso, now) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var today = now ? new Date(now) : new Date();
    var sameDay = d.getFullYear() === today.getFullYear()
      && d.getMonth() === today.getMonth()
      && d.getDate() === today.getDate();
    return sameDay
      ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  }

  root.LEAChat = {
    BODY_MAX: BODY_MAX,
    IMAGE_TYPES: IMAGE_TYPES,
    IMAGE_MAX_BYTES: IMAGE_MAX_BYTES,
    GIF_MAX_BYTES: GIF_MAX_BYTES,
    SHRINK_EDGE: SHRINK_EDGE,
    threadKey: threadKey,
    groupThreads: groupThreads,
    threadMessages: threadMessages,
    sendable: sendable,
    imageProblem: imageProblem,
    needsShrinking: needsShrinking,
    shrinkToFit: shrinkToFit,
    shortTime: shortTime
  };
})(typeof window !== 'undefined' ? window : globalThis);
