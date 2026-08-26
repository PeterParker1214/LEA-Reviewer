/* LEAAvatar — profile pictures, and the initials that stand in for them.
 *
 * Initials are the default rather than a fallback: a profile never looks
 * empty, and the leaderboard gains faces without anyone uploading anything.
 *
 * Everything here degrades honestly. Photo storage needs a Supabase bucket
 * and an avatar_url column (design_handoff_lea_reviewer/avatars-setup.sql);
 * until both exist, capability() reports false and the calling page hides the
 * upload controls rather than offering a button that fails. The page asks
 * rather than assumes, so running the SQL turns the feature on with no
 * redeploy.
 */
(function () {
  'use strict';

  var BUCKET = 'avatars';
  var MAX_BYTES = 5 * 1024 * 1024;   // "up to 5 MB", per the frame
  var OUT_SIZE = 512;                // square, and small enough to load fast

  function initialsOf(name) {
    var parts = String(name || '').split(/[^A-Za-z0-9]+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  /**
   * What this deployment can actually do, asked rather than assumed.
   * Resolves { column, bucket, ready }.
   */
  function capability(sb, userId) {
    var col = sb.from('profiles').select('avatar_url').eq('id', userId).limit(1)
      .then(function (r) { return !r.error; })
      .catch(function () { return false; });
    // Detecting the bucket took three attempts; the first two were both wrong,
    // in opposite directions, and both would have shipped:
    //
    //   storage.list()      — returns an empty array and NO error for a bucket
    //                         that does not exist. Reported ready on a project
    //                         with no bucket: a button that fails on first use.
    //   storage.getBucket() — an admin endpoint. The app's public key cannot
    //                         read it, so it answers "Bucket not found" even
    //                         when the bucket is there. Hid a working feature.
    //
    // Asking the public URL for an object that cannot exist needs no special
    // permission and is unambiguous: a real bucket says the OBJECT is missing,
    // a missing bucket says the BUCKET is. That is the question being asked.
    var bucket = fetch(
      sb.storage.from(BUCKET).getPublicUrl('__probe__').data.publicUrl,
      { cache: 'no-store' }
    ).then(function (r) {
      return r.text().then(function (body) {
        if (r.ok) return true;
        return body.indexOf('NoSuchBucket') === -1 && body.indexOf('Bucket not found') === -1;
      });
    }).catch(function () { return false; });
    return Promise.all([col, bucket]).then(function (both) {
      return { column: both[0], bucket: both[1], ready: both[0] && both[1] };
    });
  }

  /**
   * Centre-crop to a square and shrink to OUT_SIZE.
   *
   * The frame asks for a square; cropping here means the reader never has to
   * produce one, and it drops a 5 MB phone photo to a few tens of kilobytes,
   * so the leaderboard is not loading megabytes of faces.
   */
  function toSquareBlob(file) {
    return new Promise(function (resolve, reject) {
      if (!file || String(file.type || '').indexOf('image/') !== 0) {
        return reject(new Error('not-an-image'));
      }
      if (file.size > MAX_BYTES) return reject(new Error('too-big'));

      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        try {
          var side = Math.min(img.width, img.height);
          var sx = (img.width - side) / 2;
          var sy = (img.height - side) / 2;
          var canvas = document.createElement('canvas');
          canvas.width = OUT_SIZE;
          canvas.height = OUT_SIZE;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, sx, sy, side, side, 0, 0, OUT_SIZE, OUT_SIZE);
          canvas.toBlob(function (blob) {
            if (blob) resolve(blob); else reject(new Error('encode-failed'));
          }, 'image/jpeg', 0.85);
        } catch (e) { reject(e); }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('unreadable'));
      };
      img.src = url;
    });
  }

  // One file per person, in a folder named after their user id — that is what
  // the storage policies key on, so nobody can write over anyone else.
  function pathFor(userId) { return userId + '/avatar.jpg'; }

  function upload(sb, userId, file) {
    return toSquareBlob(file).then(function (blob) {
      return sb.storage.from(BUCKET).upload(pathFor(userId), blob, {
        upsert: true, contentType: 'image/jpeg', cacheControl: '3600'
      }).then(function (res) {
        if (res.error) throw res.error;
        var pub = sb.storage.from(BUCKET).getPublicUrl(pathFor(userId));
        // The path never changes, so without this the browser keeps showing
        // the picture it already cached. A new stamp each upload is a new URL.
        var url = pub.data.publicUrl + '?v=' + Date.now();
        return sb.from('profiles').update({ avatar_url: url }).eq('id', userId)
          .then(function (r) { if (r.error) throw r.error; return url; });
      });
    });
  }

  function remove(sb, userId) {
    return sb.storage.from(BUCKET).remove([pathFor(userId)])
      .catch(function () { /* already gone is not a failure */ })
      .then(function () {
        return sb.from('profiles').update({ avatar_url: null }).eq('id', userId)
          .then(function (r) { if (r.error) throw r.error; return null; });
      });
  }

  /** Inner markup for an avatar box: the picture, or the initials. */
  function faceHtml(avatarUrl, name) {
    if (avatarUrl) {
      return '<img src="' + String(avatarUrl).replace(/"/g, '&quot;') + '" alt="">';
    }
    return initialsOf(name).replace(/[&<>]/g, '');
  }

  window.LEAAvatar = {
    initialsOf: initialsOf,
    capability: capability,
    upload: upload,
    remove: remove,
    faceHtml: faceHtml,
    MAX_BYTES: MAX_BYTES,
    BUCKET: BUCKET
  };
})();
