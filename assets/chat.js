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
  var IMAGE_MAX_BYTES = 2 * 1024 * 1024;

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

  /** Why this file cannot be sent, or null when it can. */
  function imageProblem(file) {
    if (!file) return 'No file.';
    if (IMAGE_TYPES.indexOf(file.type) === -1) return 'Pictures and GIFs only.';
    if (file.size > IMAGE_MAX_BYTES) return 'Keep it under 2 MB.';
    return null;
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
    threadKey: threadKey,
    groupThreads: groupThreads,
    threadMessages: threadMessages,
    sendable: sendable,
    imageProblem: imageProblem,
    shortTime: shortTime
  };
})(typeof window !== 'undefined' ? window : globalThis);
