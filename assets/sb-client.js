/*
 * One Supabase client per page, shared by the page itself, module-progress.js
 * and presence.js.
 *
 * Each of those used to create its own. Two clients on one page both keep the
 * same login alive, so both refresh the same token, and the loser of that race
 * can find its refresh token already spent and sign the reader out. And only
 * Home knew that an unticked "Keep me signed in" keeps the login in
 * sessionStorage: every other page read localStorage alone and saw nobody
 * signed in.
 *
 * Load it right after the supabase-js script, then call leaClient().
 */
(function () {
  var URL = 'https://rjrrprbvsmflzncojbtq.supabase.co';
  var KEY = 'sb_publishable_NcOypGF5CxQgEoNWjYqOnQ_oO3NR_1Y';

  // The login lives in localStorage (survives closing the browser) or
  // sessionStorage (does not). Home sets window.leaPersistSession when someone
  // signs in; after that, a token refresh stays wherever the login already is.
  var storage = {
    getItem: function (k) {
      try { var v = localStorage.getItem(k); return v !== null ? v : sessionStorage.getItem(k); }
      catch (e) { return null; }
    },
    setItem: function (k, v) {
      try {
        var keep = typeof window.leaPersistSession === 'boolean'
          ? window.leaPersistSession
          : !(sessionStorage.getItem(k) !== null && localStorage.getItem(k) === null);
        if (keep) { localStorage.setItem(k, v); sessionStorage.removeItem(k); }
        else { sessionStorage.setItem(k, v); localStorage.removeItem(k); }
      } catch (e) {}
    },
    removeItem: function (k) {
      try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) {}
    }
  };

  window.leaClient = function () {
    return window.__leaSharedClient || (window.__leaSharedClient = window.supabase.createClient(URL, KEY, {
      auth: { storage: storage, persistSession: true, autoRefreshToken: true }
    }));
  };
})();
