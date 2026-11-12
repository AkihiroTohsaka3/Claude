/* Socle : constantes, dates, stockage, réglages, récurrence, état de la page, thème. */
"use strict";

var MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
var MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
var DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
var DAYS_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
var COLORS = ["#f4b4c4", "#e9cf8e", "#c9d3e6", "#b89cc0", "#a8d5c2"];
var RULE_LABELS = { daily: "Chaque jour", weekdays: "Jours ouvrés", weekly: "Chaque semaine", monthly: "Chaque mois", yearly: "Chaque année", every: "Personnalisée" };
var TASK_RULES = [{ value: "", label: "Une fois" }, { value: "daily", label: "Chaque jour" }, { value: "weekdays", label: "Jours ouvrés" }, { value: "weekly", label: "Chaque semaine" }, { value: "monthly", label: "Chaque mois" }];
var THEMES = ["rose", "oled", "mocha", "neon"];
var SNAP = 15;
var KEY_EVENTS = "cal-events-v3", KEY_EVENTS_V2 = "cal-events-v2", KEY_TASKS = "cal-tasks-v2", KEY_TASKS_V1 = "cal-tasks-v1";
var KEY_THEME = "cal-theme-v1", KEY_ROLLOVER = "cal-rollover-v1", KEY_OLD = "calendar-events-v1";

// ---------- Utilitaires ----------
function pad(n) { return (n < 10 ? "0" : "") + n; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function keyOf(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function parseKey(k) { var p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function mondayOf(d) { return addDays(d, -dowIdx(d)); }
function startOfToday() { var t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
function addMonthsClamped(d, n) {
  var target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  var last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), last));
  return target;
}
function toMin(hhmm) { var p = hhmm.split(":"); return (+p[0]) * 60 + (+p[1]); }
function fromMin(m) { m = clamp(m, 0, 1439); return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function plural(n, one, many) { return n + " " + (n > 1 ? many : one); }
// Durée lisible : 40 min, 1 h, 1 h 40.
function fmtDur(m) { if (m < 60) return m + " min"; return Math.floor(m / 60) + " h" + (m % 60 ? " " + pad(m % 60) : ""); }
// Fin en minutes ; un événement qui finit après minuit s'arrête à 24:00 sur son jour.
function endMin(ev) { var s = toMin(ev.start), e = toMin(ev.end); return e <= s ? 1440 : e; }
function shortDay(k) { var d = parseKey(k); return d.getDate() + " " + MONTHS_SHORT[d.getMonth()]; }
function rangeLabel(a, b) {
  var da = parseKey(a), db = parseKey(b);
  if (da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth()) return "Du " + da.getDate() + " au " + shortDay(b);
  return "Du " + shortDay(a) + " au " + shortDay(b);
}
function weekNumber(d) {
  var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  var day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  var yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function el_(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function svgIcon(d, cls) {
  var ns = "http://www.w3.org/2000/svg";
  var s = document.createElementNS(ns, "svg");
  s.setAttribute("class", "i " + (cls || ""));
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("aria-hidden", "true");
  var p = document.createElementNS(ns, "path");
  p.setAttribute("d", d);
  s.appendChild(p);
  return s;
}
function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* non supporté */ } }

// ---------- Stockage ----------
function readStore(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } }
function writeStore(key, value) { try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; } }
function loadList(key) {
  var raw = readStore(key);
  if (!raw) return null;
  try { var arr = JSON.parse(raw); return Array.isArray(arr) ? arr : null; } catch (e) { return null; }
}
function normalize(e) {
  return {
    id: e.id || uid(), uid: e.uid || null, title: e.title || "", date: e.date, start: e.start || "09:00", end: e.end || "10:00",
    allDay: !!e.allDay, endDate: e.endDate || null, place: e.place || "", notes: e.notes || "",
    color: e.color || COLORS[0], rule: e.rule || null, until: e.until || null, skip: Array.isArray(e.skip) ? e.skip : [],
    every: +e.every || 1, unit: e.unit === "week" ? "week" : "day", tz: typeof e.tz === "string" ? e.tz : "",
    remindAt: /^\d{2}:\d{2}$/.test(e.remindAt || "") ? e.remindAt : "",
    reminds: Array.isArray(e.reminds) ? e.reminds.map(Number).filter(function (n) { return n > 0; }) : (e.remind ? [+e.remind] : []),
    bBefore: +e.bBefore || 0, bAfter: +e.bAfter || 0, remind: +e.remind || 0, checklist: Array.isArray(e.checklist) ? e.checklist : [],
    mod: +e.mod || 0
  };
}
function normalizeTask(t) {
  return {
    id: t.id || uid(), title: t.title || "", date: t.date, done: !!t.done, created: t.created || Date.now(),
    subs: Array.isArray(t.subs) ? t.subs : [], pomos: +t.pomos || 0, rule: t.rule || null, until: t.until || null,
    doneDates: Array.isArray(t.doneDates) ? t.doneDates : [], notes: t.notes || "", star: !!t.star, mod: +t.mod || 0
  };
}
function loadEvents() {
  var arr = loadList(KEY_EVENTS);
  if (arr) return arr.map(normalize);
  var v2 = loadList(KEY_EVENTS_V2);
  if (v2) return v2.map(normalize);
  var migrated = [];
  try {
    var old = readStore(KEY_OLD);
    var map = old ? JSON.parse(old) : {};
    Object.keys(map).forEach(function (k) {
      (map[k] || []).forEach(function (e) { migrated.push(normalize({ id: e.id, title: e.title, date: k, start: e.start, end: e.end, place: e.place })); });
    });
  } catch (e) { /* ignoré */ }
  return migrated;
}
function loadTasks() {
  var arr = loadList(KEY_TASKS);
  if (arr) return arr.map(normalizeTask);
  var v1 = loadList(KEY_TASKS_V1) || [];
  return v1.map(normalizeTask);
}

var KEY_SET = "cal-settings-v1";
function cleanSettings(s) {
  s = s || {};
  var ws = [6, 7, 8, 9, 10].indexOf(s.workStart) >= 0 ? s.workStart : 9, we = [16, 17, 18, 19, 20, 22].indexOf(s.workEnd) >= 0 ? s.workEnd : 18;
  return {
    weekStart: s.weekStart === 0 ? 0 : 1, dur: [15, 30, 60].indexOf(s.dur) >= 0 ? s.dur : 60, span: s.span === 3 ? 3 : 7, workShade: s.workShade !== false,
    workStart: ws, workEnd: we, zoom: [0.75, 1, 1.5].indexOf(s.zoom) >= 0 ? s.zoom : 1,
    theme: THEMES.indexOf(s.theme) >= 0 ? s.theme : "",
    zones: Array.isArray(s.zones) ? s.zones.filter(function (z) { return typeof z === "string"; }).slice(0, 6) : [],
    mod: +s.mod || 0
  };
}
var settings = (function () {
  var s = {};
  try { s = JSON.parse(readStore(KEY_SET) || "{}") || {}; } catch (e) { s = {}; }
  return cleanSettings(s);
})();
// Synchronisation entre appareils (js/sync.js). Sans elle, tout reste sur l'appareil.
var Sync = window.CalSync || { start: function () {}, prime: function () {}, track: function () {}, touch: function () {} };
function saveSettings() { settings.mod = Date.now(); writeStore(KEY_SET, JSON.stringify(settings)); Sync.touch(); }
function dowIdx(d) { return (d.getDay() - settings.weekStart + 7) % 7; }
function weekLabels() { var out = []; for (var i = 0; i < 7; i++) out.push(DAYS_SHORT[(i + (settings.weekStart === 0 ? 6 : 0)) % 7]); return out; }

var events = loadEvents();
var tasks = loadTasks();
Sync.prime("events", events);
Sync.prime("tasks", tasks);
function saveEvents() { Sync.track("events", events); return writeStore(KEY_EVENTS, JSON.stringify(events)); }
function saveTasks() { Sync.track("tasks", tasks); return writeStore(KEY_TASKS, JSON.stringify(tasks)); }
// Événements d'un jour sans tenir compte des filtres (conflits, mini-calendrier).
function rawEventsOn(k) { return events.filter(function (e) { return occursOn(e, k); }); }

// ---------- Récurrence (événements et tâches) ----------
function occursOn(ev, k) {
  if (ev.skip && ev.skip.indexOf(k) >= 0) return false;
  if (ev.allDay && ev.endDate) return k >= ev.date && k <= ev.endDate;
  if (!ev.rule) return ev.date === k;
  if (k < ev.date) return false;
  if (ev.until && k > ev.until) return false;
  var d = parseKey(k), s = parseKey(ev.date);
  switch (ev.rule) {
    case "daily": return true;
    case "weekdays": return d.getDay() > 0 && d.getDay() < 6;
    case "weekly": return d.getDay() === s.getDay();
    case "monthly": return d.getDate() === s.getDate();
    case "yearly": return d.getDate() === s.getDate() && d.getMonth() === s.getMonth();
    case "every": {
      var diff = Math.round((d - s) / 86400000);
      var n = ev.every || 1;
      return ev.unit === "week" ? (diff % (7 * n) === 0) : (diff % n === 0);
    }
    default: return false;
  }
}
function taskOccurs(t, k) { return occursOn({ date: t.date, rule: t.rule, until: t.until, skip: [] }, k); }
function taskDone(t, k) { return t.rule ? t.doneDates.indexOf(k) >= 0 : t.done; }

function eventsOn(k) {
  return events.filter(function (e) {
    if (!occursOn(e, k)) return false;
    if (state.cat != null && catIndex(e) !== state.cat) return false;
    if (state.hidden[catIndex(e)]) return false;
    return true;
  }).map(function (e) { var c = Object.assign({}, e); c.occDate = k; return c; })
    .sort(function (a, b) {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
    });
}
function allTasksOn(k) { return tasks.filter(function (t) { return taskOccurs(t, k); }); }
function tasksOn(k) {
  return allTasksOn(k).filter(function (t) { return !state.openOnly || !taskDone(t, k); })
    .sort(function (a, b) {
      var da = taskDone(a, k), db = taskDone(b, k);
      if (da !== db) return da ? 1 : -1;
      if (a.star !== b.star) return a.star ? -1 : 1;
      return a.created - b.created;
    });
}
function masterOf(id) { for (var i = 0; i < events.length; i++) if (events[i].id === id) return events[i]; return null; }
function taskById(id) { for (var i = 0; i < tasks.length; i++) if (tasks[i].id === id) return tasks[i]; return null; }
function catIndex(ev) { var i = COLORS.indexOf(ev.color); return i < 0 ? 0 : i; }
function colorOf(ev) { return ev.color || COLORS[0]; }
function timeLabel(ev) {
  if (ev.allDay) return ev.endDate && ev.endDate !== ev.date ? rangeLabel(ev.date, ev.endDate) : "Journée entière";
  return ev.start + "–" + ev.end + (toMin(ev.end) <= toMin(ev.start) ? " (lendemain)" : "");
}
function repLabel(ev) { return ev.rule ? " · ↻ " + RULE_LABELS[ev.rule] : ""; }

// ---------- État ----------
var state = { view: "month", cursor: startOfToday(), cat: null, openOnly: false, scope: "all", taskRule: "", hidden: {} };
var keepScroll = false, scrollMemo = null, tasksOpen = false, expanded = {};
var editingId = null, editingOcc = null, armedBtn = null, pendingTaskId = null, draftSubs = [];
var snackTimer = null, undoAction = null, suppressClick = false;
var mqDesk = window.matchMedia ? window.matchMedia("(min-width: 960px)") : { matches: false };
var mqFine = window.matchMedia ? window.matchMedia("(hover: hover) and (pointer: fine)") : { matches: false };
function isDesk() { return mqDesk.matches; }
function byId(id) { return document.getElementById(id); }
// Pixels par minute dans la grille horaire (réglage « taille de la grille »).
function ppm() { return settings.zoom; }
function applyZoom() { document.documentElement.style.setProperty("--hh", (60 * settings.zoom) + "px"); }
applyZoom();
// Jour sous un point de l'écran (case du mois, colonne de la semaine, bandeau, grille).
function dayAt(x, y) {
  var hit = document.elementFromPoint(x, y);
  var n = hit && hit.closest ? hit.closest("[data-key], [data-day]") : null;
  return n ? (n.getAttribute("data-key") || n.getAttribute("data-day")) : null;
}
// À appeler avant une modification par glissement : renvoie la fonction qui propose d'annuler.
function undoPoint(label) {
  var ev0 = JSON.stringify(events), tk0 = JSON.stringify(tasks);
  return function () {
    showUndo(label, function () {
      events = JSON.parse(ev0).map(normalize);
      tasks = JSON.parse(tk0).map(normalizeTask);
      saveEvents(); saveTasks(); refresh();
    });
  };
}
// Vrai pendant un glissement lancé par appui long : la page ne défile pas sous le doigt.
var dragging = false;
document.addEventListener("touchmove", function (e) { if (dragging && e.cancelable) e.preventDefault(); }, { passive: false });
document.addEventListener("contextmenu", function (e) { if (e.target.closest && e.target.closest("#view")) { var pt = lastPointer; if (pt === "touch" || dragging) e.preventDefault(); } });
var lastPointer = "mouse";
document.addEventListener("pointerdown", function (e) { lastPointer = e.pointerType; }, true);
var pomo = null;

var el = {
  eyebrow: document.getElementById("eyebrow"), period: document.getElementById("period"),
  view: document.getElementById("view"), filters: document.getElementById("filters"),
  prev: document.getElementById("prev"), next: document.getElementById("next"), today: document.getElementById("today"),
  tabs: document.querySelectorAll("[data-view]"), fab: document.getElementById("fab"),
  snack: document.getElementById("snack"), snackText: document.getElementById("snack-text"), snackUndo: document.getElementById("snack-undo"),
  pomo: document.getElementById("pomo"), pomoTitle: document.getElementById("pomo-title"), pomoTime: document.getElementById("pomo-time"),
  pomoFill: document.getElementById("pomo-fill"), pomoToggle: document.getElementById("pomo-toggle"),
  pomoMode: document.getElementById("pomo-mode"), pomoStop: document.getElementById("pomo-stop"),
  sheet: document.getElementById("sheet"), form: document.getElementById("form"), sheetTitle: document.getElementById("sheetTitle"),
  fNlp: document.getElementById("f-nlp"), fTitle: document.getElementById("f-title"), fAllDay: document.getElementById("f-allday"),
  times: document.getElementById("times"), fStart: document.getElementById("f-start"), fEnd: document.getElementById("f-end"),
  fDate: document.getElementById("f-date"), fEndDate: document.getElementById("f-enddate"), endWrap: document.getElementById("enddate-wrap"),
  fRule: document.getElementById("f-rule"), fUntil: document.getElementById("f-until"), untilWrap: document.getElementById("until-wrap"),
  buffers: document.getElementById("buffers"), fBBefore: document.getElementById("f-bbefore"), fBAfter: document.getElementById("f-bafter"),
  fPlace: document.getElementById("f-place"), fNotes: document.getElementById("f-notes"), notesPreview: document.getElementById("notes-preview"),
  swatches: document.getElementById("swatches"), checklist: document.getElementById("checklist"), status: document.getElementById("status"),
  del: document.getElementById("del"), delSeries: document.getElementById("del-series"), dup: document.getElementById("dup"),
  cancel: document.getElementById("cancel"), close: document.getElementById("close"),
  picker: document.getElementById("picker"), pickerTitle: document.getElementById("pickerTitle"), pickerBody: document.getElementById("pickerBody"),
  drawer: document.getElementById("drawer"), drawerTitle: document.getElementById("drawerTitle"), drawerBody: document.getElementById("drawerBody"),
  drawerClose: document.getElementById("drawer-close"), search: document.getElementById("search"), searchInput: document.getElementById("search-input"),
  searchScope: document.getElementById("search-scope"), results: document.getElementById("results"),
  searchBtn: document.getElementById("search-btn"), searchClose: document.getElementById("search-close"),
  menu: document.getElementById("menu"), menuBtn: document.getElementById("menu-btn"), menuClose: document.getElementById("menu-close"),
  menuStatus: document.getElementById("menu-status"), themes: document.getElementById("themes"),
  importFile: document.getElementById("import-file"), exportBtn: document.getElementById("export-btn"),
  exportDlg: document.getElementById("export"), exportClose: document.getElementById("export-close"),
  icsText: document.getElementById("ics-text"), copyBtn: document.getElementById("copy-btn"), copyStatus: document.getElementById("copy-status")
};

function openDialog(d) { if (typeof d.showModal === "function") { if (!d.open) d.showModal(); } else d.setAttribute("open", ""); }
function closeDialog(d) { if (typeof d.close === "function") d.close(); else d.removeAttribute("open"); d.style.transform = ""; }

// Glissement vers le bas pour fermer une feuille. Ignoré si le contenu est déjà défilé.
function bindSwipeClose(d, onClose) {
  var st = { y: null, dy: 0 };
  d.addEventListener("touchstart", function (e) {
    if (d.scrollTop > 0) { st.y = null; return; }
    st.y = e.touches[0].clientY; st.dy = 0;
    d.style.transition = "none";
  }, { passive: true });
  d.addEventListener("touchmove", function (e) {
    if (st.y == null) return;
    st.dy = Math.max(0, e.touches[0].clientY - st.y);
    d.style.transform = "translateY(" + st.dy + "px)";
  }, { passive: true });
  d.addEventListener("touchend", function () {
    if (st.y == null) return;
    d.style.transition = "";
    if (st.dy > 90) { d.style.transform = ""; onClose(); }
    else d.style.transform = "";
    st.y = null;
  });
}

// ---------- Thème ----------
function applyTheme(name) {
  if (THEMES.indexOf(name) < 0) name = "rose";
  document.documentElement.setAttribute("data-palette", name);
  Array.prototype.forEach.call(el.themes.querySelectorAll("[data-theme]"), function (b) {
    b.setAttribute("aria-pressed", b.getAttribute("data-theme") === name ? "true" : "false");
  });
  return name;
}
applyTheme(settings.theme || readStore(KEY_THEME) || "rose");
el.themes.addEventListener("click", function (e) {
  var b = e.target.closest("[data-theme]");
  if (b) { settings.theme = applyTheme(b.getAttribute("data-theme")); writeStore(KEY_THEME, settings.theme); saveSettings(); }
});

// ---------- Report automatique (tâches ponctuelles non faites) ----------
function rollover() {
  var todayK = keyOf(new Date());
  if (readStore(KEY_ROLLOVER) === todayK) return 0;
  var moved = 0;
  tasks = tasks.map(function (t) {
    if (!t.rule && !t.done && t.date < todayK) { moved++; return Object.assign({}, t, { date: todayK }); }
    return t;
  });
  if (moved) saveTasks();
  writeStore(KEY_ROLLOVER, todayK);
  return moved;
}
var rolledOver = rollover();
