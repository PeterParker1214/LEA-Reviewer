/**
 * LEADocxQuiz — reads a .docx answer key into the site's question shape.
 *
 * Expects the house layout, which is what the reviewer generator writes:
 *
 *     Subtopic name              <- a Heading paragraph
 *     1. Question text           <- numbered
 *     A. wrong   B. **right**    <- the CORRECT choice is the bold one
 *     Explanation in italics
 *     Source: … in italics
 *
 * The bold run is the answer. That is the whole trick, and it is why this can
 * read a key at all without being told one: Word keeps the formatting, and a
 * plain-text read would throw it away.
 *
 * No libraries. A .docx is a zip of XML, so this unzips it with the browser's
 * own DecompressionStream and parses the XML with DOMParser. Everything stays
 * on the machine — nothing is uploaded to read a file.
 */
window.LEADocxQuiz = (function () {
  'use strict';

  var W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  /* ---------------- minimal zip reader ---------------- */
  // Only what a .docx needs: find one entry by name in the central directory
  // and inflate it. Stored (0) and deflated (8) are the only methods Word uses.
  function findEntry(buf, wanted) {
    var dv = new DataView(buf), i;
    // End of central directory: scan back for its signature.
    for (i = buf.byteLength - 22; i >= 0; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) break;
    }
    if (i < 0) throw new Error('That file is not a valid .docx (no zip directory).');
    var count = dv.getUint16(i + 10, true);
    var off = dv.getUint32(i + 16, true);
    var dec = new TextDecoder();

    for (var n = 0; n < count; n++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      var method = dv.getUint16(off + 10, true);
      var compSize = dv.getUint32(off + 20, true);
      var nameLen = dv.getUint16(off + 28, true);
      var extraLen = dv.getUint16(off + 30, true);
      var commentLen = dv.getUint16(off + 32, true);
      var localOff = dv.getUint32(off + 42, true);
      var name = dec.decode(new Uint8Array(buf, off + 46, nameLen));

      if (name === wanted) {
        // The local header repeats the name/extra lengths, and they can differ
        // from the central directory's — read them from the local header.
        var lNameLen = dv.getUint16(localOff + 26, true);
        var lExtraLen = dv.getUint16(localOff + 28, true);
        var dataOff = localOff + 30 + lNameLen + lExtraLen;
        return { method: method, bytes: new Uint8Array(buf, dataOff, compSize) };
      }
      off += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error('That .docx has no ' + wanted + ' inside it.');
  }

  function inflate(entry) {
    if (entry.method === 0) return Promise.resolve(entry.bytes);
    if (entry.method !== 8)
      return Promise.reject(new Error('Unsupported compression in that .docx.'));
    if (typeof DecompressionStream !== 'function')
      return Promise.reject(new Error('This browser cannot unzip .docx files. Use Chrome or Edge.'));
    var stream = new Blob([entry.bytes]).stream()
      .pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }

  /* ---------------- paragraphs, with their formatting kept ---------------- */
  function paragraphs(xml) {
    var doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('Could not read that .docx.');
    var out = [];
    var ps = doc.getElementsByTagNameNS(W, 'p');

    for (var i = 0; i < ps.length; i++) {
      var p = ps[i], runs = [], text = '';
      var style = '';
      var pStyle = p.getElementsByTagNameNS(W, 'pStyle')[0];
      if (pStyle) style = pStyle.getAttributeNS(W, 'val') || '';

      var rs = p.getElementsByTagNameNS(W, 'r');
      for (var j = 0; j < rs.length; j++) {
        var r = rs[j];
        var ts = r.getElementsByTagNameNS(W, 't');
        var rt = '';
        for (var k = 0; k < ts.length; k++) rt += ts[k].textContent;
        if (!rt) continue;
        var pr = r.getElementsByTagNameNS(W, 'rPr')[0];
        var bold = false, italic = false;
        if (pr) {
          var b = pr.getElementsByTagNameNS(W, 'b')[0];
          var it = pr.getElementsByTagNameNS(W, 'i')[0];
          // <w:b/> means on; <w:b w:val="0"/> means off.
          bold = !!b && b.getAttributeNS(W, 'val') !== '0' && b.getAttributeNS(W, 'val') !== 'false';
          italic = !!it && it.getAttributeNS(W, 'val') !== '0' && it.getAttributeNS(W, 'val') !== 'false';
        }
        runs.push({ text: rt, bold: bold, italic: italic });
        text += rt;
      }
      out.push({ text: text.replace(/\s+/g, ' ').trim(), style: style, runs: runs });
    }
    return out;
  }

  /* ---------------- turn paragraphs into questions ---------------- */
  var NUM_RE = /^(\d{1,3})[.)]\s+(.+)$/;
  var OPT_RE = /^\(?([A-H])[.)]\s+(.+)$/;

  function parseParagraphs(paras) {
    var rows = [], cur = null, subtopic = '', warnings = [];

    function flush() {
      if (!cur) return;
      if (cur.o.length >= 2 && cur.c >= 0) rows.push(cur);
      else if (cur.q) warnings.push('Q' + cur._n + ' dropped: ' +
        (cur.o.length < 2 ? 'fewer than two choices' : 'no bold choice, so no answer'));
      cur = null;
    }

    for (var i = 0; i < paras.length; i++) {
      var p = paras[i];
      if (!p.text) continue;

      if (/^Heading/i.test(p.style) || /^Title$/i.test(p.style)) {
        flush();
        // Heading 1 is the subtopic; a Title is the document name, not a topic.
        if (/^Heading[12]$/i.test(p.style)) subtopic = p.text;
        continue;
      }

      var mo = OPT_RE.exec(p.text);
      if (mo && cur) {
        var isBold = p.runs.length > 0 && p.runs.every(function (r) {
          return !r.text.trim() || r.bold;
        });
        cur.o.push(mo[2].trim());
        if (isBold) cur.c = cur.o.length - 1;
        continue;
      }

      var mn = NUM_RE.exec(p.text);
      if (mn && !mo) {
        flush();
        cur = { s: subtopic, q: mn[2].trim(), o: [], c: -1, ref: '', n: '', _n: mn[1] };
        continue;
      }

      if (cur && cur.o.length) {
        // After the choices, italic paragraphs are the explanation and source.
        var allItalic = p.runs.length > 0 && p.runs.every(function (r) {
          return !r.text.trim() || r.italic;
        });
        var srcM = /^Source:\s*(.+)$/i.exec(p.text);
        if (srcM) { cur.ref = srcM[1].trim(); continue; }
        if (allItalic) { cur.n = cur.n ? cur.n + ' ' + p.text : p.text; continue; }
      }
      // Anything else (running text, the meta line) is ignored on purpose.
    }
    flush();
    return { rows: rows, warnings: warnings };
  }

  /**
   * Read a File/Blob. Resolves { rows, warnings } with rows in the site's
   * {s,q,o,c,ref,n} shape.
   */
  function read(file) {
    return file.arrayBuffer()
      .then(function (buf) { return inflate(findEntry(buf, 'word/document.xml')); })
      .then(function (bytes) {
        var xml = new TextDecoder('utf-8').decode(bytes);
        var res = parseParagraphs(paragraphs(xml));
        if (!res.rows.length) {
          throw new Error('Read the document but found no questions. It needs numbered ' +
            'questions, choices lettered A./B./C./D., and the correct choice in bold.');
        }
        return res;
      });
  }

  return { read: read, parseParagraphs: parseParagraphs, paragraphs: paragraphs };
})();
