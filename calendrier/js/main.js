/* Menu, réglages, horloge mondiale, rappels, raccourcis clavier, synchronisation et démarrage. */
"use strict";

function renderCalVis() {
  var box = document.getElementById("cal-vis");
  box.innerHTML = "";
  COLORS.forEach(function (c, i) {
    var b = el_("button", "opt");
    b.type = "button";
    b.setAttribute("aria-label", "Afficher la catégorie " + (i + 1));
    b.setAttribute("aria-pressed", state.hidden[i] ? "false" : "true");
    var dot = el_("i");
    dot.style.background = c;
    b.appendChild(dot);
    b.appendChild(document.createTextNode(state.hidden[i] ? "masquée" : "affichée"));
    b.addEventListener("click", function () { state.hidden[i] = !state.hidden[i]; renderCalVis(); refresh(); });
    box.appendChild(b);
  });
}
el.menuBtn.addEventListener("click", function () { el.menuStatus.textContent = ""; renderCalVis(); renderWorldClock(); openDialog(el.menu); });
el.menuClose.addEventListener("click", function () { closeDialog(el.menu); });
el.exportClose.addEventListener("click", function () { closeDialog(el.exportDlg); });
// Fenêtre de texte à copier (export .ics ou sauvegarde complète), avec téléchargement quand il est possible.
var dlUrl = null;
function openExport(title, hint, text, filename, type) {
  byId("exportTitle").textContent = title;
  byId("export-hint").textContent = hint;
  el.icsText.value = text;
  el.copyStatus.textContent = "";
  var dl = byId("dl-btn");
  if (dlUrl) { URL.revokeObjectURL(dlUrl); dlUrl = null; }
  // Dans Claude, la page ne peut pas télécharger de fichier : on copie le texte.
  dl.hidden = !!window.claude;
  if (!dl.hidden) { dlUrl = URL.createObjectURL(new Blob([text], { type: type })); dl.href = dlUrl; dl.download = filename; }
  closeDialog(el.menu);
  openDialog(el.exportDlg);
  el.icsText.focus();
  el.icsText.select();
}
el.exportBtn.addEventListener("click", function () {
  openExport("Export .ics", "Pour un autre agenda (Google, Samsung…). Copie le texte dans un fichier nommé calendrier.ics, ou télécharge-le, puis ouvre-le avec ton application de calendrier.",
    buildIcs(), "calendrier.ics", "text/calendar");
});

// ---------- Sauvegarde complète ----------
function backupText() {
  return JSON.stringify({ app: "calendrier-velours", version: 1, date: new Date().toISOString(), events: events, tasks: tasks, settings: settings });
}
function restoreBackup(text) {
  var d = JSON.parse(String(text || "").trim());
  if (!d || !Array.isArray(d.events) || !Array.isArray(d.tasks)) throw new Error("format");
  var before = { events: JSON.stringify(events), tasks: JSON.stringify(tasks) };
  function merge(list, incoming, norm) {
    var byKey = {};
    list.forEach(function (x, i) { byKey[x.id] = i; });
    incoming.forEach(function (x) {
      if (!x || typeof x !== "object" || !x.date) return;
      var n = norm(x);
      if (byKey[n.id] != null) list[byKey[n.id]] = n; else { byKey[n.id] = list.length; list.push(n); }
    });
  }
  merge(events, d.events, normalize);
  merge(tasks, d.tasks, normalizeTask);
  if (d.settings && typeof d.settings === "object") {
    settings = cleanSettings(d.settings);
    saveSettings();
    if (settings.theme) applyTheme(settings.theme);
    applyZoom();
    renderSettingsBtns();
  }
  saveEvents();
  saveTasks();
  return { events: d.events.length, tasks: d.tasks.length, before: before };
}
byId("backup-btn").addEventListener("click", function () {
  openExport("Sauvegarde complète", "Copie ce texte (ou télécharge le fichier), puis sur l'autre appareil : Options › Restaurer une sauvegarde, et colle-le.",
    backupText(), "calendrier-sauvegarde-" + keyOf(new Date()) + ".json", "application/json");
});
byId("restore-btn").addEventListener("click", function () {
  byId("restore-text").value = "";
  byId("restore-status").textContent = "";
  closeDialog(el.menu);
  openDialog(byId("restore"));
});
byId("restore-close").addEventListener("click", function () { closeDialog(byId("restore")); });
function doRestore(text) {
  var st = byId("restore-status");
  var r;
  try { r = restoreBackup(text); } catch (e) { st.className = "status error"; st.textContent = "Ce texte n'est pas une sauvegarde du calendrier. Copie-la en entier, puis recolle-la."; return; }
  closeDialog(byId("restore"));
  state.cursor = startOfToday();
  render(false);
  showUndo("Sauvegarde restaurée : " + plural(r.events, "événement", "événements") + ", " + plural(r.tasks, "tâche", "tâches"), function () {
    events = JSON.parse(r.before.events).map(normalize);
    tasks = JSON.parse(r.before.tasks).map(normalizeTask);
    saveEvents(); saveTasks(); render(false);
  });
}
byId("restore-go").addEventListener("click", function () { doRestore(byId("restore-text").value); });
byId("restore-file").addEventListener("change", function () {
  var f = this.files && this.files[0];
  if (!f) return;
  var rd = new FileReader();
  rd.onload = function () { byId("restore-file").value = ""; doRestore(String(rd.result || "")); };
  rd.readAsText(f);
});

// ---------- Application installable (hors de Claude) ----------
var installEvt = null;
window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installEvt = e; byId("install-btn").hidden = false; });
window.addEventListener("appinstalled", function () { installEvt = null; byId("install-btn").hidden = true; });
byId("install-btn").addEventListener("click", function () {
  if (!installEvt) return;
  installEvt.prompt();
  installEvt.userChoice.then(function () { installEvt = null; byId("install-btn").hidden = true; }, function () {});
});
if (!window.claude && "serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () { /* hors ligne indisponible */ }); });
}
el.copyBtn.addEventListener("click", function () {
  var text = el.icsText.value;
  var fallback = function () { el.icsText.focus(); el.icsText.select(); el.copyStatus.textContent = "Sélectionné. Appuie longuement pour copier."; };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { el.copyStatus.textContent = "Texte copié."; }, fallback);
    else fallback();
  } catch (err) { fallback(); }
});
el.importFile.addEventListener("change", function () {
  var file = el.importFile.files && el.importFile.files[0];
  if (!file) return;
  var before = { events: JSON.stringify(events), tasks: JSON.stringify(tasks) };
  var reader = new FileReader();
  reader.onload = function () {
    var res = parseIcs(String(reader.result || ""));
    saveEvents(); saveTasks();
    el.importFile.value = "";
    closeDialog(el.menu);
    state.cursor = startOfToday();
    render(false);
    showUndo(res.events + " cours ou événement(s), " + res.tasks + " tâche(s) importés" + (res.skipped ? ", " + res.skipped + " déjà présent(s)" : ""), function () {
      events = JSON.parse(before.events);
      tasks = JSON.parse(before.tasks);
      saveEvents(); saveTasks(); render(false);
    });
  };
  reader.onerror = function () { el.menuStatus.textContent = "Lecture du fichier impossible."; };
  reader.readAsText(file);
});

// ---------- Commandes ----------
el.prev.addEventListener("click", function () { step(-1); });
el.next.addEventListener("click", function () { step(1); });
el.today.addEventListener("click", function () { state.cursor = startOfToday(); render(true); });
Array.prototype.forEach.call(el.tabs, function (t) {
  t.addEventListener("click", function () { state.view = t.getAttribute("data-view"); render(true); });
});
el.fab.addEventListener("click", function () { openSheet(keyOf(state.cursor), null, null); });
byId("create").addEventListener("click", function () { openSheet(keyOf(state.cursor), null, null); });
function gotoDate() { pickDate(null, false, function (k) { state.cursor = parseKey(k); render(true); }, "Aller à une date"); }
byId("period-btn").addEventListener("click", gotoDate);
byId("copyday-btn").addEventListener("click", function () {
  var from = keyOf(state.cursor);
  closeDialog(el.menu);
  pickDate(null, false, function (target) { copyDay(from, target); }, "Copier le " + shortDay(from) + " vers");
});
// Changement de taille d'écran : la mise en page s'adapte (sauf pendant une saisie, le clavier redimensionne la page).
var resizeTimer = null, lastW = window.innerWidth;
window.addEventListener("resize", function () {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function () {
    var a = document.activeElement, typing = a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA");
    if (typing && window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    if (!dragging) refresh();
  }, 160);
});

var swipe = { x: null, y: null };
el.view.addEventListener("touchstart", function (e) {
  if (e.target.closest && e.target.closest(".evb, .task, .tl-wrap, .twrap, textarea, input")) { swipe.x = null; return; }
  swipe.x = e.touches[0].clientX; swipe.y = e.touches[0].clientY;
}, { passive: true });
el.view.addEventListener("touchend", function (e) {
  if (swipe.x == null) return;
  if (suppressClick || dragging) { swipe.x = null; return; }
  var t = e.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
  swipe.x = null;
  if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) step(dx < 0 ? 1 : -1);
}, { passive: true });

// Glissement vers le bas sur chaque feuille
bindSwipeClose(el.sheet, closeSheet);
bindSwipeClose(el.picker, function () { closeDialog(el.picker); });
bindSwipeClose(el.drawer, function () { closeDialog(el.drawer); });
bindSwipeClose(el.search, function () { closeDialog(el.search); });
bindSwipeClose(el.menu, function () { closeDialog(el.menu); });
bindSwipeClose(el.exportDlg, function () { closeDialog(el.exportDlg); });
bindSwipeClose(byId("restore"), function () { closeDialog(byId("restore")); });

// Options et sélecteurs : câblage unique
optGroup(document.getElementById("rule-chips"), [
  { value: "", label: "Aucune" }, { value: "daily", label: "Chaque jour" }, { value: "weekdays", label: "Jours ouvrés" },
  { value: "weekly", label: "Chaque semaine" }, { value: "monthly", label: "Chaque mois" }, { value: "yearly", label: "Chaque année" }, { value: "every", label: "Tous les N" }
], el.fRule, syncFields);
var bufOpts = [{ value: "0", label: "Aucun" }, { value: "15", label: "15 min" }, { value: "30", label: "30 min" }];
optGroup(document.getElementById("buf-before"), bufOpts, el.fBBefore, null);
optGroup(document.getElementById("buf-after"), bufOpts, el.fBAfter, null);
var durBox = document.getElementById("dur-chips");
DUR.forEach(function (d) {
  var b = el_("button", "opt", fmtDur(d));
  b.type = "button";
  b.setAttribute("data-dur", String(d));
  b.addEventListener("click", function () {
    var s = el.fStart.value || "09:00";
    el.fStart.value = s;
    el.fEnd.value = fromMin(toMin(s) + d);
    syncFields();
  });
  durBox.appendChild(b);
});
optGroup(document.getElementById("unit-chips"), [{ value: "day", label: "jours" }, { value: "week", label: "semaines" }], document.getElementById("f-unit"), null);
REMIND_OPTS.forEach(function (o) {
  var b = el_("button", "opt", o.label);
  b.type = "button";
  b.setAttribute("data-m", String(o.value));
  b.addEventListener("click", function () {
    var v = o.value, i = reminds.indexOf(v);
    if (i >= 0) reminds.splice(i, 1); else reminds.push(v);
    renderRemind();
  });
  document.getElementById("rem-chips").appendChild(b);
});

// Horloge mondiale : heure actuelle dans les fuseaux choisis (Intl, sans réseau).
function zoneTime(z) {
  try {
    return new Intl.DateTimeFormat("fr-FR", { timeZone: z, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date());
  } catch (e) { return "fuseau inconnu"; }
}
function renderWorldClock() {
  var box = document.getElementById("wc-list");
  box.innerHTML = "";
  settings.zones.forEach(function (z, i) {
    var row = el_("div", "wc-row");
    row.appendChild(el_("span", null, z.replace(/_/g, " ")));
    row.appendChild(el_("b", null, zoneTime(z)));
    var rm = el_("button", "x", "×");
    rm.type = "button";
    rm.setAttribute("aria-label", "Retirer " + z);
    rm.addEventListener("click", function () { settings.zones.splice(i, 1); saveSettings(); renderWorldClock(); });
    row.appendChild(rm);
    box.appendChild(row);
  });
}
document.getElementById("wc-add").addEventListener("click", function () {
  var v = document.getElementById("wc-input").value.trim();
  if (!v) return;
  try { new Intl.DateTimeFormat("fr-FR", { timeZone: v }); } catch (e) { el.menuStatus.textContent = "Fuseau inconnu : utilise par exemple Europe/Paris."; return; }
  if (settings.zones.indexOf(v) < 0 && settings.zones.length < 6) settings.zones.push(v);
  saveSettings();
  document.getElementById("wc-input").value = "";
  el.menuStatus.textContent = "";
  renderWorldClock();
});
setInterval(function () { if (el.menu.open) renderWorldClock(); }, 30000);

function renderSettingsBtns() {
  document.getElementById("ws-btn").textContent = "Premier jour : " + (settings.weekStart === 1 ? "lundi" : "dimanche");
  document.getElementById("span-btn").textContent = "Vue Semaine : " + (settings.span === 3 ? "3 jours" : "7 jours");
  document.getElementById("work-btn").textContent = "Griser les heures hors travail : " + (settings.workShade ? "oui" : "non");
  var box = document.getElementById("dur-set");
  box.innerHTML = "";
  [15, 30, 60].forEach(function (d) {
    var b = el_("button", "opt", d === 60 ? "1 h" : d + " min");
    b.type = "button";
    b.setAttribute("aria-pressed", settings.dur === d ? "true" : "false");
    b.addEventListener("click", function () { settings.dur = d; saveSettings(); renderSettingsBtns(); });
    box.appendChild(b);
  });
  function chips(id, values, key, label) {
    var c = byId(id);
    c.innerHTML = "";
    values.forEach(function (v) {
      var b = el_("button", "opt", label(v));
      b.type = "button";
      b.setAttribute("aria-pressed", settings[key] === v ? "true" : "false");
      b.addEventListener("click", function () { settings[key] = v; saveSettings(); applyZoom(); renderSettingsBtns(); render(false); });
      c.appendChild(b);
    });
  }
  chips("work-start", [6, 7, 8, 9, 10], "workStart", function (v) { return v + " h"; });
  chips("work-end", [16, 17, 18, 19, 20, 22], "workEnd", function (v) { return v + " h"; });
  chips("zoom-set", [0.75, 1, 1.5], "zoom", function (v) { return v === 0.75 ? "Compacte" : v === 1 ? "Normale" : "Grande"; });
}
document.getElementById("ws-btn").addEventListener("click", function () { settings.weekStart = settings.weekStart === 1 ? 0 : 1; saveSettings(); renderSettingsBtns(); refresh(); });
document.getElementById("span-btn").addEventListener("click", function () { settings.span = settings.span === 3 ? 7 : 3; saveSettings(); renderSettingsBtns(); refresh(); });
document.getElementById("work-btn").addEventListener("click", function () { settings.workShade = !settings.workShade; saveSettings(); renderSettingsBtns(); refresh(); });
renderSettingsBtns();

document.getElementById("goto-btn").addEventListener("click", function () {
  closeDialog(el.menu);
  gotoDate();
});
document.getElementById("notif-btn").addEventListener("click", function () {
  if (!("Notification" in window)) { el.menuStatus.textContent = "Notifications non disponibles ici."; return; }
  Notification.requestPermission().then(function (p) {
    el.menuStatus.textContent = p === "granted" ? "Notifications activées." : "Notifications refusées ou non accordées.";
  }, function () { el.menuStatus.textContent = "Demande de notification impossible."; });
});

// Rappels : vérifiés toutes les 30 s tant que la page est ouverte.
var notified = {};
function checkReminders() {
  var now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes(), todayK = keyOf(now);
  eventsOn(todayK).forEach(function (ev) {
    if (!ev.allDay && ev.remindAt && nowMin >= toMin(ev.remindAt) && nowMin < toMin(ev.start)) {
      var fixedKey = ev.id + "|" + todayK + "|at|" + ev.remindAt;
      if (!notified[fixedKey]) {
        notified[fixedKey] = true;
        showUndo("Aujourd'hui à " + ev.start + " : " + ev.title + (ev.place ? " · " + ev.place : ""), null);
        if ("Notification" in window && Notification.permission === "granted") {
          try { new Notification(ev.title, { body: "Aujourd'hui à " + ev.start }); } catch (err) { /* ignoré */ }
        }
        buzz([120, 80, 120]);
      }
    }
    if (ev.allDay || !ev.reminds || !ev.reminds.length) return;
    var st = toMin(ev.start);
    if (nowMin >= st) return;
    var due = ev.reminds.filter(function (r) { return nowMin >= st - r; });
    if (!due.length) return;
    var key = ev.id + "|" + todayK + "|" + ev.start + "|" + Math.max.apply(null, due);
    if (notified[key]) return;
    notified[key] = true;
    var msg = "Dans " + fmtDur(st - nowMin) + " : " + ev.title + (ev.place ? " · " + ev.place : "");
    showUndo(msg, null);
    buzz([120, 80, 120]);
    if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification(ev.title, { body: msg }); } catch (err) { /* ignoré */ }
    }
  });
}
setInterval(checkReminders, 30000);
checkReminders();

// Raccourcis clavier (ignorés quand on saisit du texte ou qu'une fenêtre est ouverte).
document.addEventListener("keydown", function (e) {
  if (document.querySelector("dialog[open]")) return;
  var tg = e.target;
  if (tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA" || tg.tagName === "SELECT" || tg.isContentEditable)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  var views = { "1": "day", "2": "week", "3": "month", "4": "year", "5": "agenda" };
  if (views[e.key]) { state.view = views[e.key]; render(true); return; }
  if (e.key === "t") { state.cursor = startOfToday(); render(true); }
  else if (e.key === "ArrowLeft") step(-1);
  else if (e.key === "ArrowRight") step(1);
  else if (e.key === "n") openSheet(keyOf(state.cursor), null, null);
  else if (e.key === "v") openVoice();
  else if (e.key === "/") { e.preventDefault(); el.searchBtn.click(); }
});

document.getElementById("btn-start").addEventListener("click", function () { pickTime(el.fStart); });
document.getElementById("btn-remindat").addEventListener("click", function () {
  pickTime(document.getElementById("f-remindat"), true);
});
document.getElementById("btn-end").addEventListener("click", function () { pickTime(el.fEnd); });
document.getElementById("btn-date").addEventListener("click", function () { pickDate(el.fDate, false); });
document.getElementById("btn-enddate").addEventListener("click", function () { pickDate(el.fEndDate, true); });
document.getElementById("btn-until").addEventListener("click", function () { pickDate(el.fUntil, true); });
refreshDisplays();

// ---------- Synchronisation entre appareils ----------
var SYNC_TEXT = {
  local: window.claude
    ? "Enregistré sur cet appareil uniquement. Ouvre le calendrier depuis Claude, connecté à ton compte, pour le retrouver sur tes autres appareils."
    : "Enregistré sur cet appareil. Pense à faire une sauvegarde complète de temps en temps (Options › Données).",
  connecting: "Connexion à ta sauvegarde en ligne…",
  synced: "Synchronisé avec ton compte. Tu retrouves les mêmes données sur ton téléphone et ton ordinateur.",
  saving: "Enregistrement en ligne…",
  offline: "Sauvegarde en ligne injoignable pour l'instant. Tes modifications restent sur cet appareil et partiront dès que possible.",
  error: "Synchronisation interrompue."
};
function showSync(st, detail) {
  ["sync-side", "sync-menu"].forEach(function (id) {
    var n = byId(id);
    n.textContent = detail || SYNC_TEXT[st] || "";
    n.setAttribute("data-state", st);
  });
  byId("sync-dot").hidden = !(st === "offline" || st === "error");
}
showSync("local");
Sync.start({
  get: function () { return { events: events, tasks: tasks, settings: settings }; },
  // On n'applique pas de données venues d'ailleurs pendant un glissement ou une saisie dans la page.
  busy: function () {
    var a = document.activeElement;
    return dragging || !!(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA") && a.closest && a.closest("#view, #side"));
  },
  status: showSync,
  apply: function (next) {
    if (next.events) { events = next.events.map(normalize); writeStore(KEY_EVENTS, JSON.stringify(events)); Sync.prime("events", events); }
    if (next.tasks) { tasks = next.tasks.map(normalizeTask); writeStore(KEY_TASKS, JSON.stringify(tasks)); Sync.prime("tasks", tasks); }
    if (next.settings) {
      settings = cleanSettings(next.settings);
      writeStore(KEY_SET, JSON.stringify(settings));
      if (settings.theme) applyTheme(settings.theme);
      applyZoom();
      renderSettingsBtns();
    }
    refresh();
  }
});

render(false);
if (rolledOver) showUndo(plural(rolledOver, "tâche non faite reportée", "tâches non faites reportées") + " à aujourd'hui", null);
