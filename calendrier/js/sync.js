/* Synchronisation entre appareils.
 *
 * Les données restent d'abord dans le navigateur (localStorage). Quand la page est ouverte
 * dans Claude avec un compte connecté, elles sont aussi rangées dans l'espace privé de ce
 * compte, puis fusionnées avec celles des autres appareils.
 *
 * Fusion : chaque événement ou tâche porte la date de sa dernière modification (`mod`).
 * Pour un même identifiant, la version la plus récente gagne. Une suppression laisse une
 * trace datée (« tombe ») pour ne pas ressusciter l'élément depuis un autre appareil.
 */
(function () {
  "use strict";

  var BUCKETS = { events: 16, tasks: 4 };
  var PREFIX = { events: "ev-", tasks: "tk-" };
  var KEY_TOMB = "cal-tomb-v1";
  var TOMB_TTL = 60 * 86400000;
  var MAX_DOC = 240000;

  var hooks = null, col = null, readOnly = false, gotServer = false;
  var known = { events: {}, tasks: {} };
  var remote = {};
  var pushTimer = null, pushing = false, pushAgain = false, loadTimer = null, retryTimer = null, mergeTimer = null;
  var pending = null;
  var state = "local", detail = "";

  function readTomb() {
    try {
      var t = JSON.parse(window.localStorage.getItem(KEY_TOMB) || "{}") || {};
      var out = { events: t.events || {}, tasks: t.tasks || {} }, limit = Date.now() - TOMB_TTL;
      ["events", "tasks"].forEach(function (k) {
        Object.keys(out[k]).forEach(function (id) { if (!(out[k][id] > limit)) delete out[k][id]; });
      });
      return out;
    } catch (e) { return { events: {}, tasks: {} }; }
  }
  var tomb = readTomb();
  function saveTomb() { try { window.localStorage.setItem(KEY_TOMB, JSON.stringify(tomb)); } catch (e) { /* ignoré */ } }

  // Texte stable d'une valeur (clés triées), pour comparer deux états.
  function canon(v) {
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    if (v && typeof v === "object") {
      return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + canon(v[k]); }).join(",") + "}";
    }
    return JSON.stringify(v === undefined ? null : v);
  }
  function body(item) { var c = {}; Object.keys(item).forEach(function (k) { if (k !== "mod") c[k] = item[k]; }); return canon(c); }
  function bucket(id, n) { var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h % n; }
  function byId(a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }

  function setState(s, d) {
    state = s; detail = d || "";
    if (hooks && hooks.status) { try { hooks.status(s, detail); } catch (e) { /* ignoré */ } }
  }

  // État de référence, sans dater quoi que ce soit (au chargement, ou après une fusion).
  function prime(kind, list) {
    var m = {};
    list.forEach(function (it) { m[it.id] = body(it); });
    known[kind] = m;
  }
  // Après une modification locale : date les éléments changés et note les suppressions.
  function track(kind, list) {
    var now = Date.now(), prev = known[kind], cur = {}, dirty = false;
    list.forEach(function (it) {
      var b = body(it);
      cur[it.id] = b;
      if (prev[it.id] !== b) { it.mod = now; dirty = true; }
      if (tomb[kind][it.id]) { delete tomb[kind][it.id]; if (!(it.mod > 0)) it.mod = now; dirty = true; }
    });
    Object.keys(prev).forEach(function (id) { if (!(id in cur)) { tomb[kind][id] = now; dirty = true; } });
    known[kind] = cur;
    if (dirty) { saveTomb(); schedulePush(); }
  }

  function buildDocs() {
    var s = hooks.get(), docs = {};
    ["events", "tasks"].forEach(function (kind) {
      for (var i = 0; i < BUCKETS[kind]; i++) docs[PREFIX[kind] + i] = { items: [], tomb: {} };
      s[kind].forEach(function (it) { docs[PREFIX[kind] + bucket(it.id, BUCKETS[kind])].items.push(it); });
      Object.keys(tomb[kind]).forEach(function (id) { docs[PREFIX[kind] + bucket(id, BUCKETS[kind])].tomb[id] = tomb[kind][id]; });
      for (var j = 0; j < BUCKETS[kind]; j++) docs[PREFIX[kind] + j].items.sort(byId);
    });
    docs.settings = { value: s.settings, mod: +s.settings.mod || 0 };
    return docs;
  }

  function schedulePush() {
    if (!col || readOnly) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 1200);
  }
  function push() {
    if (!col || readOnly) return;
    if (pushing) { pushAgain = true; return; }
    var docs = buildDocs(), todo = [];
    Object.keys(docs).forEach(function (id) {
      var d = docs[id], c = canon(d);
      if (remote[id] === c) return;
      if (remote[id] === undefined && id !== "settings" && !d.items.length && !Object.keys(d.tomb).length) return;
      if (id === "settings" && !(d.mod > 0) && remote[id] === undefined) return;
      todo.push({ id: id, data: JSON.parse(JSON.stringify(d)), c: c });
    });
    if (!todo.length) { if (gotServer) setState("synced"); return; }
    pushing = true;
    setState("saving");
    var failed = null;
    // Un seul envoi à la fois par document, comme le demande le service.
    var chain = todo.reduce(function (p, t) {
      return p.then(function () {
        if (failed) return null;
        if (t.c.length > MAX_DOC) { failed = { code: "too_big" }; return null; }
        return col.doc(t.id).set(t.data).then(function () { remote[t.id] = t.c; }, function (e) { failed = e || { code: "unavailable" }; });
      });
    }, Promise.resolve());
    chain.then(function () {
      pushing = false;
      if (failed) { onPushError(failed); return; }
      if (pushAgain) { pushAgain = false; push(); return; }
      setState(gotServer ? "synced" : "offline");
    });
  }
  function onPushError(e) {
    var code = e && e.code;
    if (code === "quota_exceeded" || code === "too_big") { setState("error", "Espace de synchronisation plein. Tes données restent sur cet appareil."); return; }
    if (code === "invalid_argument" || code === "revoked" || code === "not_granted") {
      readOnly = true;
      setState("error", "Synchronisation refusée pour ce compte. Tes données restent sur cet appareil.");
      return;
    }
    setState("offline");
    clearTimeout(retryTimer);
    retryTimer = setTimeout(function () { pushAgain = false; push(); }, 4000 + Math.random() * 3000);
  }

  function mergeKind(kind, local, rItems, rTomb) {
    var t = tomb[kind], tombChanged = false;
    Object.keys(rTomb).forEach(function (id) { if (!(t[id] >= rTomb[id])) { t[id] = rTomb[id]; tombChanged = true; } });
    var l = {}, out = [];
    local.forEach(function (it) { l[it.id] = it; });
    var ids = {};
    Object.keys(l).forEach(function (id) { ids[id] = 1; });
    Object.keys(rItems).forEach(function (id) { ids[id] = 1; });
    Object.keys(ids).forEach(function (id) {
      var a = l[id], b = rItems[id];
      var best = a && b ? ((+b.mod || 0) > (+a.mod || 0) ? b : a) : (a || b);
      if (t[id] && t[id] >= (+best.mod || 0)) return;
      if (t[id]) { delete t[id]; tombChanged = true; }
      out.push(best);
    });
    if (kind === "events") {
      // Un même cours importé sur deux appareils (même UID) n'est gardé qu'une fois.
      var seen = {}, keep = [];
      out.sort(function (a, b) { return (+b.mod || 0) - (+a.mod || 0) || byId(a, b); }).forEach(function (it) {
        if (it.uid) { if (seen[it.uid]) { t[it.id] = Date.now(); tombChanged = true; return; } seen[it.uid] = true; }
        keep.push(it);
      });
      out = keep;
    }
    out.sort(byId);
    if (tombChanged) saveTomb();
    var before = canon(local.slice().sort(byId));
    return canon(out) === before ? null : out;
  }

  function applySnapshot(snap) {
    if (hooks.busy && hooks.busy()) { pending = snap; clearTimeout(mergeTimer); mergeTimer = setTimeout(function () { var p = pending; pending = null; if (p) applySnapshot(p); }, 700); return; }
    var rItems = { events: {}, tasks: {} }, rTomb = { events: {}, tasks: {} }, rSettings = null;
    snap.docs.forEach(function (d) {
      var data = d.data();
      if (!data) return;
      remote[d.id] = canon(data);
      var kind = d.id.indexOf(PREFIX.events) === 0 ? "events" : d.id.indexOf(PREFIX.tasks) === 0 ? "tasks" : null;
      if (kind) {
        (Array.isArray(data.items) ? data.items : []).forEach(function (it) { if (it && typeof it.id === "string") rItems[kind][it.id] = it; });
        var tb = data.tomb || {};
        Object.keys(tb).forEach(function (id) { if (+tb[id] > 0) rTomb[kind][id] = +tb[id]; });
      } else if (d.id === "settings") rSettings = data;
    });
    var s = hooks.get(), next = {};
    var ev = mergeKind("events", s.events, rItems.events, rTomb.events);
    var tk = mergeKind("tasks", s.tasks, rItems.tasks, rTomb.tasks);
    if (ev) next.events = ev;
    if (tk) next.tasks = tk;
    if (rSettings && rSettings.value && (+rSettings.mod || 0) > (+s.settings.mod || 0)) next.settings = rSettings.value;
    if (next.events || next.tasks || next.settings) hooks.apply(JSON.parse(JSON.stringify(next)));
    if (!snap.metadata || !snap.metadata.fromCache) { gotServer = true; clearTimeout(loadTimer); }
    push();
  }

  function start(h) {
    hooks = h;
    if (!window.claude || typeof window.claude.use !== "function") { setState("local"); return; }
    setState("connecting");
    Promise.all([window.claude.use("db"), window.claude.use("user")]).then(function (r) {
      var db = r[0], user = r[1];
      if (!db || !user) { setState("local"); return null; }
      return user.id().then(function (id) {
        if (!id) { setState("local"); return; }
        col = db.collection("data/users/" + id);
        // Sans réponse du serveur au bout de 10 s, on le dit : la page continue de marcher sur l'appareil.
        loadTimer = setTimeout(function () { if (!gotServer) setState("offline"); }, 10000);
        col.onSnapshot(applySnapshot, function (e) {
          clearTimeout(loadTimer);
          col = null;
          setState("error", e && e.code === "revoked" ? "La synchronisation a été coupée. Tes données restent sur cet appareil." : "Synchronisation interrompue. Recharge la page pour la relancer.");
        });
      });
    }).catch(function () { setState("local"); });
  }

  window.CalSync = {
    start: start, prime: prime, track: track, touch: schedulePush,
    state: function () { return { state: state, detail: detail }; }
  };
})();
