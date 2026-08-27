/* LEAImageIntake — take an image from a paste, a drop or a file picker, shrink
 * it, and hand back a data: URI ready to store on a question.
 *
 * WHY A DATA URI RATHER THAN A FILE
 * ---------------------------------
 * Saving a file would mean writing binary through the admin's save function,
 * which takes a string and has only ever been given text. Whether it can write
 * binary is unverified, and the only way to find out is to commit to the live
 * repository. An inline data: URI needs none of that: it is part of the
 * question's own text, so it saves through the path already proven, it cannot
 * be orphaned by a sweep for unused files, it works offline with no extra
 * cache entry, and the Structural exam already ships twenty figures this way,
 * so the engine demonstrably renders them.
 *
 * The cost is size, which is why everything here is about keeping it small.
 */
(function () {
  'use strict';

  var MAX_EDGE = 1400;          // px; a figure never needs more on this site
  var WARN_BYTES = 250 * 1024;  // a data URI past this bloats the module file
  var HARD_BYTES = 2 * 1024 * 1024;

  function readable(bytes) {
    return bytes < 1024 ? bytes + ' B'
      : bytes < 1024 * 1024 ? Math.round(bytes / 1024) + ' KB'
      : (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  /**
   * Shrink and encode. Tries PNG and JPEG and keeps whichever is smaller:
   * line drawings and screenshots compress far better as PNG, photographs far
   * better as JPEG, and a figure bank contains both.
   */
  function process(file) {
    return new Promise(function (resolve, reject) {
      if (!file || String(file.type || '').indexOf('image/') !== 0) {
        return reject(new Error('That is not an image.'));
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        try {
          var scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
          var w = Math.max(1, Math.round(img.width * scale));
          var h = Math.max(1, Math.round(img.height * scale));

          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext('2d');
          // White underneath: figures sit on a light plate in the app, and a
          // transparent PNG flattened to JPEG would otherwise go black.
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);

          var png = canvas.toDataURL('image/png');
          var jpg = canvas.toDataURL('image/jpeg', 0.85);
          var out = png.length <= jpg.length ? png : jpg;
          var bytes = Math.round((out.length - out.indexOf(',') - 1) * 3 / 4);

          if (bytes > HARD_BYTES) {
            return reject(new Error('That image is still ' + readable(bytes) +
              ' after shrinking — too big to store in a question.'));
          }
          resolve({
            dataUrl: out,
            width: w, height: h,
            bytes: bytes,
            type: out.indexOf('image/png') !== -1 ? 'PNG' : 'JPEG',
            scaled: scale < 1,
            heavy: bytes > WARN_BYTES
          });
        } catch (e) { reject(new Error('Could not process that image.')); }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read that image.'));
      };
      img.src = url;
    });
  }

  /** The first image on a paste or drop event, or null. */
  function fileFromEvent(e) {
    var dt = e.clipboardData || e.dataTransfer;
    if (!dt) return null;
    var items = dt.items;
    if (items) {
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && String(items[i].type).indexOf('image/') === 0) {
          return items[i].getAsFile();
        }
      }
    }
    var files = dt.files;
    if (files) {
      for (var j = 0; j < files.length; j++) {
        if (String(files[j].type).indexOf('image/') === 0) return files[j];
      }
    }
    return null;
  }

  /**
   * Wire a box so it accepts a picture three ways: click to browse, drag and
   * drop, or paste while it has focus.
   *
   * Paste is per-box rather than global on purpose. A single document-level
   * handler would have to guess which of a hundred boxes the reader meant, and
   * would quietly put the picture on the wrong question.
   */
  function attach(el, handlers) {
    handlers = handlers || {};
    var onImage = handlers.onImage || function () {};
    var onError = handlers.onError || function () {};
    var busy = false;

    function take(file) {
      if (!file || busy) return;
      busy = true;
      if (handlers.onStart) handlers.onStart();
      process(file).then(function (res) {
        busy = false; onImage(res);
      }).catch(function (err) {
        busy = false; onError(err.message || String(err));
      });
    }

    el.addEventListener('click', function () {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.addEventListener('change', function () { take(input.files && input.files[0]); });
      input.click();
    });

    el.addEventListener('dragover', function (e) { e.preventDefault(); el.classList.add('over'); });
    el.addEventListener('dragleave', function () { el.classList.remove('over'); });
    el.addEventListener('drop', function (e) {
      e.preventDefault(); el.classList.remove('over');
      take(fileFromEvent(e));
    });

    el.addEventListener('paste', function (e) {
      var f = fileFromEvent(e);
      if (f) { e.preventDefault(); take(f); }
    });

    // Focusable so a paste can be aimed at it, and reachable by keyboard.
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
    });
  }

  window.LEAImageIntake = {
    process: process,
    fileFromEvent: fileFromEvent,
    attach: attach,
    readable: readable,
    MAX_EDGE: MAX_EDGE,
    WARN_BYTES: WARN_BYTES
  };
})();
