/* LEA Reviewer — shared "who's online" presence tracker.
   Included on every page so signed-in users count as online no matter
   which page of the site they're on, not just the main dashboard. */
(function () {
  var SUPABASE_URL = 'https://rjrrprbvsmflzncojbtq.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_NcOypGF5CxQgEoNWjYqOnQ_oO3NR_1Y';
  var CHANNEL_NAME = 'online-users';

  function ensureLib(cb) {
    if (window.supabase && window.supabase.createClient) { cb(); return; }
    var existing = document.querySelector('script[data-lea-supabase-lib]');
    if (existing) { existing.addEventListener('load', cb); return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
    s.setAttribute('data-lea-supabase-lib', '1');
    s.onload = cb;
    document.head.appendChild(s);
  }

  function resolveUsername(sb, user) {
    return sb.from('profiles').select('username').eq('id', user.id).single()
      .then(function (res) {
        var profile = res && res.data;
        return (profile && profile.username) || (user.email || '').split('@')[0];
      })
      .catch(function () { return (user.email || '').split('@')[0]; });
  }

  // opts: { client?: existing supabase client, onChange?: function(namesArray) }
  function init(opts) {
    opts = opts || {};
    ensureLib(function () {
      var sb = opts.client || (window.__leaSharedClient = window.__leaSharedClient ||
        supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
      var channel = null;

      function pushState() {
        if (!channel || !opts.onChange) return;
        var state = channel.presenceState();
        var names = Object.values(state).flat().map(function (p) { return p.username; }).filter(Boolean);
        opts.onChange(Array.from(new Set(names)));
      }

      function start(username) {
        if (channel || !username) return;
        channel = sb.channel(CHANNEL_NAME, {
          config: { presence: { key: (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())) } }
        });
        channel.on('presence', { event: 'sync' }, pushState);
        channel.subscribe(function (status) {
          if (status === 'SUBSCRIBED') {
            channel.track({ username: username, online_at: new Date().toISOString() });
          }
        });
      }

      function stop() {
        if (channel) { sb.removeChannel(channel); channel = null; }
        if (opts.onChange) opts.onChange([]);
      }

      sb.auth.onAuthStateChange(function (event, session) {
        if (event === 'SIGNED_OUT') stop();
        if (event === 'SIGNED_IN' && session) resolveUsername(sb, session.user).then(start);
      });

      sb.auth.getSession().then(function (res) {
        var session = res && res.data && res.data.session;
        if (session) resolveUsername(sb, session.user).then(start);
      });
    });
  }

  window.LEAPresence = { init: init };
})();
