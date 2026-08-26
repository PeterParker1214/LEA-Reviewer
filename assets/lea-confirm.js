/*
 * LEAConfirm / LEAAlert / LEAPrompt — in-page replacements for the native
 * confirm(), alert() and prompt() dialogs.
 *
 * Why this exists: native confirm() is silently suppressed in embedded and
 * in-app browsers (the Messenger/Instagram/Facebook webviews students often
 * open shared links in, and preview panes). It returns false without ever
 * painting a dialog, which turns every "are you sure?" prompt into a dead
 * button — the action just never happens and nothing explains why.
 *
 * This builds a real in-page bottom sheet instead, matching the site's own
 * sheet pattern, so the action works everywhere.
 *
 * Deliberately side-effect free: it defines three globals and nothing else,
 * so any page can include it without pulling in progress syncing, auth, or
 * network calls. Styles are inline var(--token, fallback) pairs, so the
 * sheet picks up the design tokens and the light/dark theme on pages that
 * define them and still renders correctly on older pages that don't. The
 * DOM is built lazily on first use rather than at load time, because this
 * script is included from <head> on some pages, where document.body is
 * still null.
 *
 * Usage — all three return promises, so call sites must await them:
 *   if (await LEAConfirm('Delete this?', { title: 'Delete', yes: 'Delete' })) ...
 *   await LEAAlert('Could not find that file.');
 *   const name = await LEAPrompt('Name:');   // string, or null if cancelled
 */
(function () {
  let els = null;
  let pending = null;

  function settle(answer) {
    if (els) els.overlay.style.display = 'none';
    const resolve = pending;
    pending = null;
    if (resolve) resolve(answer);
  }

  function build() {
    const mono = 'var(--font-mono,"IBM Plex Mono",monospace)';
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:none;' +
      'align-items:flex-end;justify-content:center;z-index:2000;';

    const sheet = document.createElement('div');
    sheet.style.cssText =
      'width:100%;max-width:640px;max-height:82vh;overflow-y:auto;' +
      'background:var(--bg-panel,#0e1c28);border-top:2px solid var(--gold,#e0a83f);' +
      'border-radius:16px 16px 0 0;padding:22px 20px 26px;' +
      'box-shadow:0 -24px 60px rgba(0,0,0,0.5);';

    const title = document.createElement('h3');
    title.style.cssText =
      'font-family:var(--font-display,"Big Shoulders Display",sans-serif);font-weight:700;' +
      'font-size:20px;text-transform:uppercase;margin:0 0 14px;color:var(--ink,#eef1e9);';

    const body = document.createElement('p');
    body.style.cssText =
      'font-family:' + mono + ';font-size:13px;line-height:1.7;' +
      'color:var(--muted,#8b98a5);margin:0 0 16px;';

    const input = document.createElement('input');
    input.type = 'text';
    input.style.cssText =
      'display:none;width:100%;height:44px;box-sizing:border-box;border-radius:8px;' +
      'background:var(--bg-panel-2,#0a1520);border:1px solid var(--line,rgba(111,168,207,0.20));' +
      'color:var(--ink,#eef1e9);font-family:' + mono + ';font-size:13px;' +
      'padding:0 12px;margin:0 0 14px;';

    const yes = document.createElement('button');
    yes.type = 'button';
    yes.style.cssText =
      'display:block;width:100%;height:48px;border-radius:10px;cursor:pointer;' +
      'background:var(--gold,#e0a83f);border:1px solid var(--gold,#e0a83f);color:#1a1206;' +
      'font-family:' + mono + ';font-size:12px;font-weight:700;' +
      'text-transform:uppercase;letter-spacing:.03em;';

    const no = document.createElement('button');
    no.type = 'button';
    no.style.cssText =
      'display:block;margin:14px auto 0;background:none;border:none;cursor:pointer;' +
      'color:var(--muted,#8b98a5);font-family:' + mono + ';' +
      'font-size:11px;text-transform:uppercase;letter-spacing:.05em;';

    sheet.appendChild(title);
    sheet.appendChild(body);
    sheet.appendChild(input);
    sheet.appendChild(yes);
    sheet.appendChild(no);
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    yes.addEventListener('click', function () { settle(true); });
    no.addEventListener('click', function () { settle(false); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) settle(false); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); settle(true); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && pending) settle(false);
    });

    return { overlay: overlay, title: title, body: body, input: input, yes: yes, no: no };
  }

  function leaConfirm(message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      // A second call while one is already open would strand the first
      // promise forever; settle it as a cancel before taking over the sheet.
      if (pending) settle(false);
      if (!els) els = build();
      els.title.textContent = opts.title || 'Are you sure?';
      els.body.textContent = message;
      els.yes.textContent = opts.yes || 'Confirm';
      els.no.textContent = opts.no || 'Cancel';
      // alert:true is the one-button form — a message to acknowledge, with
      // nothing to decline, so the cancel affordance would be meaningless.
      els.no.style.display = opts.alert ? 'none' : 'block';
      els.input.style.display = opts.input ? 'block' : 'none';
      if (opts.input) {
        els.input.value = opts.value || '';
        els.input.placeholder = opts.placeholder || '';
      }
      pending = resolve;
      els.overlay.style.display = 'flex';
      if (opts.input) els.input.focus(); else els.yes.focus();
    });
  }

  window.LEAConfirm = leaConfirm;

  window.LEAAlert = function (message, opts) {
    opts = opts || {};
    return leaConfirm(message, {
      title: opts.title || 'Heads up',
      yes: opts.yes || 'OK',
      alert: true
    });
  };

  // Resolves to the entered string, or null if cancelled — same contract as
  // native prompt(), so call sites keep their existing falsy checks.
  window.LEAPrompt = function (message, opts) {
    opts = opts || {};
    return leaConfirm(message, {
      title: opts.title || 'Enter a value',
      yes: opts.yes || 'OK',
      input: true,
      value: opts.value,
      placeholder: opts.placeholder
    }).then(function (ok) {
      return ok ? els.input.value.trim() : null;
    });
  };
})();
