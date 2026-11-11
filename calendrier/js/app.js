/* Logique du calendrier : dates, stockage, récurrence, vues, gestes, import et export .ics. */
(function () {
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
      bBefore: +e.bBefore || 0, bAfter: +e.bAfter || 0, remind: +e.remind || 0, checklist: Array.isArray(e.checklist) ? e.checklist : []
    };
  }
  function normalizeTask(t) {
    return {
      id: t.id || uid(), title: t.title || "", date: t.date, done: !!t.done, created: t.created || Date.now(),
      subs: Array.isArray(t.subs) ? t.subs : [], pomos: +t.pomos || 0, rule: t.rule || null, until: t.until || null,
      doneDates: Array.isArray(t.doneDates) ? t.doneDates : [], notes: t.notes || ""
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
  var settings = (function () {
    var s = {};
    try { s = JSON.parse(readStore(KEY_SET) || "{}") || {}; } catch (e) { s = {}; }
    return { weekStart: s.weekStart === 0 ? 0 : 1, dur: [15, 30, 60].indexOf(s.dur) >= 0 ? s.dur : 60, span: s.span === 3 ? 3 : 7, workShade: s.workShade !== false,
      zones: Array.isArray(s.zones) ? s.zones.filter(function (z) { return typeof z === "string"; }).slice(0, 6) : [] };
  })();
  function saveSettings() { writeStore(KEY_SET, JSON.stringify(settings)); }
  function dowIdx(d) { return (d.getDay() - settings.weekStart + 7) % 7; }
  function weekLabels() { var out = []; for (var i = 0; i < 7; i++) out.push(DAYS_SHORT[(i + (settings.weekStart === 0 ? 6 : 0)) % 7]); return out; }

  var events = loadEvents();
  var tasks = loadTasks();
  function saveEvents() { return writeStore(KEY_EVENTS, JSON.stringify(events)); }
  function saveTasks() { return writeStore(KEY_TASKS, JSON.stringify(tasks)); }

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
        return (da === db) ? (a.created - b.created) : (da ? 1 : -1);
      });
  }
  function masterOf(id) { for (var i = 0; i < events.length; i++) if (events[i].id === id) return events[i]; return null; }
  function taskById(id) { for (var i = 0; i < tasks.length; i++) if (tasks[i].id === id) return tasks[i]; return null; }
  function catIndex(ev) { var i = COLORS.indexOf(ev.color); return i < 0 ? 0 : i; }
  function colorOf(ev) { return ev.color || COLORS[0]; }
  function timeLabel(ev) {
    if (ev.allDay) return ev.endDate && ev.endDate !== ev.date ? "Du " + ev.date + " au " + ev.endDate : "Journée entière";
    return ev.start + "–" + ev.end;
  }
  function repLabel(ev) { return ev.rule ? " · ↻ " + RULE_LABELS[ev.rule] : ""; }

  // ---------- État ----------
  var state = { view: "month", cursor: startOfToday(), cat: null, openOnly: false, scope: "all", taskRule: "", hidden: {} };
  var keepScroll = false, scrollMemo = null, tasksOpen = false, expanded = {};
  var editingId = null, editingOcc = null, armedBtn = null, pendingTaskId = null, draftSubs = [];
  var snackTimer = null, undoAction = null, suppressClick = false, currentSlots = null;
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
  applyTheme(readStore(KEY_THEME) || "rose");
  el.themes.addEventListener("click", function (e) {
    var b = e.target.closest("[data-theme]");
    if (b) writeStore(KEY_THEME, applyTheme(b.getAttribute("data-theme")));
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

  // ---------- Saisie en langage naturel ----------
  function parseNatural(raw) {
    var title = (raw || "").trim();
    if (!title) return null;
    var today = startOfToday(), date = null, start = null, end = null, allDay = false, m;
    function cut(re) {
      m = re.exec(title);
      if (m) title = title.slice(0, m.index) + " " + title.slice(m.index + m[0].length);
      return m;
    }
    if (cut(/toute la journ[ée]e/i)) allDay = true;
    if (cut(/apr[eè]s[- ]demain/i)) date = addDays(today, 2);
    else if (cut(/aujourd['’]hui/i)) date = today;
    else if (cut(/\bdemain\b/i)) date = addDays(today, 1);
    if (!date) {
      for (var i = 0; i < 7 && !date; i++) {
        if (cut(new RegExp("\\b(?:(?:le|ce)\\s+)?" + DAYS[i] + "\\b", "i"))) {
          var diff = (i - today.getDay() + 7) % 7;
          if (diff === 0) diff = 7;
          date = addDays(today, diff);
        }
      }
    }
    if (!date && cut(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)) {
      var y = m[3] ? (m[3].length === 2 ? 2000 + (+m[3]) : +m[3]) : today.getFullYear();
      date = new Date(y, +m[2] - 1, +m[1]);
    }
    if (cut(/(?:de\s+)?(\d{1,2})(?:(?:h|:)(\d{2})?)?\s*(?:à|a|-)\s*(\d{1,2})(?:(?:h|:)(\d{2})?)?\b/i)) {
      start = pad(+m[1]) + ":" + pad(+(m[2] || 0));
      end = pad(+m[3]) + ":" + pad(+(m[4] || 0));
    } else if (cut(/(?:à\s*)?\b(\d{1,2})\s*(?:h|:)\s*(\d{2})?\b/i)) {
      start = pad(+m[1]) + ":" + pad(+(m[2] || 0));
    } else if (cut(/\bà\s+(\d{1,2})\b/i)) {
      start = pad(+m[1]) + ":00";
    }
    if (start && +start.slice(0, 2) > 23) start = null;
    if (end && +end.slice(0, 2) > 23) end = null;
    if (start && !end) end = fromMin(toMin(start) + 60);
    if (!start && !allDay) { start = "09:00"; end = "10:00"; }
    if (allDay) { start = "00:00"; end = "23:59"; }
    title = title.replace(/\s+/g, " ").replace(/^[\s,:;\-–]+|[\s,:;\-–]+$/g, "").replace(/\s(le|à|a|de|du)$/i, "");
    if (!title) title = "Nouvel événement";
    return { title: cap(title), date: keyOf(date || today), start: start, end: end, allDay: allDay };
  }
  function applyNatural() {
    var r = parseNatural(el.fNlp.value);
    if (!r) return;
    el.fTitle.value = r.title;
    el.fDate.value = r.date;
    el.fAllDay.checked = r.allDay;
    el.fStart.value = r.start || "09:00";
    el.fEnd.value = r.end || "10:00";
    syncFields();
    var d = parseKey(r.date);
    setStatus("Compris : " + r.title + " · " + d.getDate() + " " + MONTHS[d.getMonth()] + (r.allDay ? " · journée entière" : " · " + r.start + "–" + r.end), false);
  }
  el.fNlp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); applyNatural(); } });
  el.fNlp.addEventListener("change", applyNatural);

  // ---------- Texte enrichi ----------
  function inline(parent, s) {
    String(s).split(/(\*\*[^*]+\*\*|https?:\/\/[^\s<]+)/).forEach(function (part) {
      if (!part) return;
      if (/^\*\*[^*]+\*\*$/.test(part)) parent.appendChild(el_("strong", null, part.slice(2, -2)));
      else if (/^https?:\/\//.test(part)) {
        var trail = /[.,;:!?)]+$/.exec(part);
        var url = trail ? part.slice(0, -trail[0].length) : part;
        var a = el_("a", null, url);
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        parent.appendChild(a);
        if (trail) parent.appendChild(document.createTextNode(trail[0]));
      } else parent.appendChild(document.createTextNode(part));
    });
  }
  function richText(text) {
    var wrap = el_("div", "rich");
    var ul = null;
    String(text || "").split(/\r?\n/).forEach(function (line) {
      var li = /^\s*[-*]\s+(.*)$/.exec(line);
      if (li) {
        if (!ul) { ul = el_("ul"); wrap.appendChild(ul); }
        var item = el_("li");
        inline(item, li[1]);
        ul.appendChild(item);
        return;
      }
      ul = null;
      if (!line.trim()) return;
      var p = el_("p");
      inline(p, line);
      wrap.appendChild(p);
    });
    return wrap;
  }
  el.fNotes.addEventListener("input", renderNotesPreview);
  function renderNotesPreview() {
    el.notesPreview.innerHTML = "";
    if (el.fNotes.value.trim()) el.notesPreview.appendChild(richText(el.fNotes.value));
  }

  // ---------- Liste à puces interactive ----------
  function checklist(items, onChange, placeholder) {
    var box = el_("div", "subs");
    items.forEach(function (it) {
      var row = el_("div", "sub" + (it.done ? " done" : ""));
      var c = el_("button", "check");
      c.type = "button";
      c.setAttribute("aria-pressed", it.done ? "true" : "false");
      c.setAttribute("aria-label", "Cocher « " + it.text + " »");
      c.addEventListener("click", function () {
        onChange(items.map(function (x) { return x.id === it.id ? Object.assign({}, x, { done: !x.done }) : x; }));
      });
      row.appendChild(c);
      row.appendChild(el_("span", "ttl", it.text));
      var x = el_("button", "x", "×");
      x.type = "button";
      x.setAttribute("aria-label", "Supprimer « " + it.text + " »");
      x.addEventListener("click", function () { onChange(items.filter(function (y) { return y.id !== it.id; })); });
      row.appendChild(x);
      box.appendChild(row);
    });
    var form = el_("form", "sub-form");
    var inp = el_("input");
    inp.type = "text";
    inp.maxLength = 100;
    inp.placeholder = placeholder || "Ajouter une sous-tâche";
    inp.setAttribute("aria-label", "Nouvelle sous-tâche");
    var btn = el_("button", "btn small", "+ Ajouter");
    btn.type = "submit";
    form.appendChild(inp);
    form.appendChild(btn);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var v = inp.value.trim();
      if (!v) { inp.focus(); return; }
      onChange(items.concat([{ id: uid(), text: v, done: false }]));
    });
    box.appendChild(form);
    return box;
  }
  function renderSheetChecklist() {
    el.checklist.innerHTML = "";
    el.checklist.appendChild(checklist(draftSubs, function (arr) { draftSubs = arr; renderSheetChecklist(); }, "Ajouter une étape"));
  }

  // ---------- Pomodoro ----------
  var FOCUS = 25 * 60, BREAK = 5 * 60;
  function pomoDraw() {
    if (!pomo) { el.pomo.hidden = true; return; }
    el.pomo.hidden = false;
    el.pomoTitle.textContent = (pomo.mode === "focus" ? "Focus · " : "Pause · ") + pomo.title;
    el.pomoTime.textContent = pad(Math.floor(pomo.left / 60)) + ":" + pad(pomo.left % 60);
    el.pomoTime.classList.toggle("break", pomo.mode === "break");
    el.pomoFill.style.width = (100 * (1 - pomo.left / pomo.total)) + "%";
    el.pomoToggle.textContent = pomo.running ? "Pause" : "Reprendre";
    el.pomoMode.textContent = pomo.mode === "focus" ? "Passer en pause" : "Reprendre le focus";
  }
  function pomoStart(t, k) {
    pomoStop(true);
    pomo = { taskId: t.id, day: k, title: t.title, mode: "focus", left: FOCUS, total: FOCUS, running: false, timer: null, minutes: 0 };
    pomoRun(true);
  }
  function pomoRun(on) {
    if (!pomo) return;
    clearInterval(pomo.timer);
    pomo.running = on;
    if (on) pomo.timer = setInterval(pomoTick, 1000);
    pomoDraw();
  }
  function pomoTick() {
    if (!pomo) return;
    pomo.left--;
    if (pomo.left <= 0) {
      buzz([200, 100, 200, 100, 200]);
      if (pomo.mode === "focus") {
        var t = taskById(pomo.taskId);
        if (t) { t.pomos = (t.pomos || 0) + 1; saveTasks(); }
        pomo.mode = "break"; pomo.total = pomo.left = BREAK;
        showUndo("Focus terminé, pause de 5 min", null);
      } else {
        showUndo("Pause terminée", null);
        pomoStop(true);
        return;
      }
    }
    pomoDraw();
  }
  function pomoStop(silent) {
    if (pomo) clearInterval(pomo.timer);
    pomo = null;
    pomoDraw();
    if (!silent) refresh();
  }
  el.pomoToggle.addEventListener("click", function () { if (pomo) pomoRun(!pomo.running); });
  el.pomoMode.addEventListener("click", function () {
    if (!pomo) return;
    if (pomo.mode === "focus") { pomo.mode = "break"; pomo.total = pomo.left = BREAK; }
    else { pomo.mode = "focus"; pomo.total = pomo.left = FOCUS; }
    pomoRun(true);
  });
  el.pomoStop.addEventListener("click", function () { pomoStop(false); });

  // ---------- En-tête ----------
  function renderHeader() {
    var c = state.cursor, eyebrow, label;
    if (state.view === "month") { eyebrow = "Mois"; label = cap(MONTHS[c.getMonth()]) + " " + c.getFullYear(); }
    else if (state.view === "week") {
      var m = settings.span === 3 ? c : mondayOf(c), s = addDays(m, settings.span === 3 ? 2 : 6);
      eyebrow = "Semaine " + weekNumber(m);
      label = m.getDate() + " " + MONTHS_SHORT[m.getMonth()] + " – " + s.getDate() + " " + MONTHS_SHORT[s.getMonth()] + " " + s.getFullYear();
    } else if (state.view === "year") { eyebrow = "Vue annuelle"; label = String(c.getFullYear()); }
    else if (state.view === "agenda") { eyebrow = "Programme"; label = "60 prochains jours"; }
    else { eyebrow = "Jour"; label = cap(DAYS[c.getDay()]) + " " + c.getDate() + " " + MONTHS[c.getMonth()]; }
    el.eyebrow.textContent = eyebrow;
    el.period.textContent = label;
    Array.prototype.forEach.call(el.tabs, function (t) {
      t.setAttribute("aria-selected", t.getAttribute("data-view") === state.view ? "true" : "false");
    });
  }
  function renderFilters() {
    el.filters.innerHTML = "";
    var all = el_("button", "fchip", "Toutes");
    all.type = "button";
    all.setAttribute("aria-pressed", state.cat == null ? "true" : "false");
    all.addEventListener("click", function () { state.cat = null; refresh(); });
    el.filters.appendChild(all);
    COLORS.forEach(function (c, i) {
      var b = el_("button", "fchip");
      b.type = "button";
      var dot = el_("i");
      dot.style.background = c;
      b.appendChild(dot);
      b.setAttribute("aria-label", "Catégorie " + (i + 1));
      b.setAttribute("aria-pressed", state.cat === i ? "true" : "false");
      b.addEventListener("click", function () { state.cat = state.cat === i ? null : i; refresh(); });
      b.insertBefore(dot, b.firstChild);
      el.filters.appendChild(b);
    });
    var open = el_("button", "fchip", "En attente");
    open.type = "button";
    open.setAttribute("aria-pressed", state.openOnly ? "true" : "false");
    open.addEventListener("click", function () { state.openOnly = !state.openOnly; refresh(); });
    el.filters.appendChild(open);
  }

  // ---------- Éléments partagés ----------
  function evButton(ev) {
    var b = el_("button", "ev");
    b.type = "button";
    b.style.background = colorOf(ev);
    b.appendChild(el_("b", null, ev.title));
    var done = ev.checklist ? ev.checklist.filter(function (s) { return s.done; }).length : 0;
    b.appendChild(el_("small", null, timeLabel(ev) + (ev.place ? " · " + ev.place : "") + repLabel(ev) +
      (ev.checklist && ev.checklist.length ? " · " + done + "/" + ev.checklist.length + " étapes" : "") + (ev.tz ? " · " + ev.tz.split("/").pop().replace(/_/g, " ") : "")));
    b.addEventListener("click", function (e) { e.stopPropagation(); if (suppressClick) return; openSheet(ev.occDate, masterOf(ev.id), null); });
    return b;
  }

  // Ligne de tâche. opts.day = jour affiché (utile pour les tâches récurrentes).
  function taskRow(t, opts) {
    opts = opts || {};
    var k = opts.day || t.date;
    var done = taskDone(t, k);
    var wrap = el_("div", "twrap");
    var row = el_("div", "task" + (done ? " done" : ""));
    var check = el_("button", "check");
    check.type = "button";
    check.setAttribute("aria-pressed", done ? "true" : "false");
    check.setAttribute("aria-label", (done ? "Remettre à faire : " : "Marquer comme faite : ") + t.title);
    check.addEventListener("click", function (e) {
      e.stopPropagation();
      var cur = taskById(t.id);
      if (!cur) return;
      if (cur.rule) {
        var idx = cur.doneDates.indexOf(k);
        if (idx >= 0) cur.doneDates.splice(idx, 1); else cur.doneDates.push(k);
      } else {
        cur.done = !cur.done;
      }
      saveTasks();
      buzz(12);
      refresh();
    });
    row.appendChild(check);

    var title = el_("button", "ttl", t.title);
    title.type = "button";
    title.setAttribute("aria-expanded", expanded[t.id] ? "true" : "false");
    title.addEventListener("click", function () { expanded[t.id] = !expanded[t.id]; refresh(); });
    row.appendChild(title);

    var subs = t.subs || [];
    if (subs.length) row.appendChild(el_("span", "prog", subs.filter(function (s) { return s.done; }).length + "/" + subs.length));
    if (t.rule) row.appendChild(el_("span", "rep", "↻ " + RULE_LABELS[t.rule]));
    if (t.pomos) row.appendChild(el_("span", "prog", "🍅 " + t.pomos));

    if (opts.plan) {
      var pom = el_("button", "tbtn", "⏱");
      pom.type = "button";
      pom.setAttribute("aria-label", "Lancer un Pomodoro sur « " + t.title + " »");
      pom.addEventListener("click", function (e) { e.stopPropagation(); pomoStart(t, k); });
      row.appendChild(pom);
      if (!t.rule) {
        var next = el_("button", "tbtn", "→ demain");
        next.type = "button";
        next.setAttribute("aria-label", "Reporter « " + t.title + " » à demain");
        next.addEventListener("click", function (e) {
          e.stopPropagation();
          var cur = taskById(t.id);
          if (!cur) return;
          cur.date = keyOf(addDays(parseKey(cur.date), 1));
          saveTasks();
          refresh();
        });
        row.appendChild(next);
      }
      var plan = el_("button", "tbtn", "Planifier");
      plan.type = "button";
      plan.setAttribute("aria-label", "Planifier « " + t.title + " » dans la timeline");
      plan.addEventListener("click", function (e) { e.stopPropagation(); planTask(t, k, 9 * 60); });
      row.appendChild(plan);
    }
    var x = el_("button", "x", "×");
    x.type = "button";
    x.setAttribute("aria-label", "Supprimer la tâche « " + t.title + " »");
    x.addEventListener("click", function (e) {
      e.stopPropagation();
      var removed = t;
      tasks = tasks.filter(function (y) { return y.id !== t.id; });
      saveTasks();
      buzz(20);
      refresh();
      showUndo("Tâche supprimée", function () { tasks.push(removed); saveTasks(); refresh(); });
    });
    row.appendChild(x);
    if (opts.drag) bindTaskDrag(row, t, k);
    wrap.appendChild(row);

    if (expanded[t.id]) {
      var detail = el_("div", "twrap");
      detail.appendChild(checklist(subs, function (arr) {
        var cur = taskById(t.id);
        if (!cur) return;
        cur.subs = arr;
        saveTasks();
        refresh();
      }, "Ajouter une sous-tâche"));
      var note = el_("textarea", null, t.notes || "");
      note.rows = 2;
      note.maxLength = 300;
      note.placeholder = "Note (facultatif)";
      note.setAttribute("aria-label", "Note de la tâche");
      note.className = "tnote";
      note.addEventListener("change", function () {
        var cur = taskById(t.id);
        if (!cur) return;
        cur.notes = note.value.trim();
        saveTasks();
      });
      detail.appendChild(note);
      wrap.appendChild(detail);
    }
    return wrap;
  }

  // ---------- Annulation ----------
  function showUndo(text, undo) {
    undoAction = undo;
    el.snackUndo.hidden = !undo;
    el.snackText.textContent = text;
    el.snack.hidden = false;
    clearTimeout(snackTimer);
    snackTimer = setTimeout(hideUndo, 5000);
  }
  function hideUndo() { undoAction = null; el.snack.hidden = true; clearTimeout(snackTimer); }
  el.snackUndo.addEventListener("click", function () { var fn = undoAction; hideUndo(); if (fn) fn(); });

  // Vue Semaine : appui long sur une journée puis glisser vers une autre journée = événement sur plusieurs jours.
  function bindWeekRange(col, startK) {
    var g = { timer: null, active: false, sx: 0, sy: 0, endK: startK, pid: null, ghost: null };
    col.addEventListener("pointerdown", function (e) {
      if (e.button > 0 || (e.target.closest && e.target.closest(".ev, .check, .x, .ttl, .tbtn, .sub, .twrap, textarea, input"))) return;
      g.sx = e.clientX; g.sy = e.clientY; g.endK = startK; g.pid = e.pointerId;
      clearTimeout(g.timer);
      g.timer = setTimeout(function () {
        g.active = true; buzz(8);
        g.ghost = el_("div", "ghost", "Période");
        document.body.appendChild(g.ghost);
        moveGhost(g.sx, g.sy);
        try { col.setPointerCapture(g.pid); } catch (err) { /* ignoré */ }
      }, 300);
    });
    col.addEventListener("pointermove", function (e) {
      if (!g.active) { if (Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy) > 10) clearTimeout(g.timer); return; }
      moveGhost(e.clientX, e.clientY);
      var hit = document.elementFromPoint(e.clientX, e.clientY);
      var c = hit && hit.closest ? hit.closest(".wday[data-key]") : null;
      if (c) g.endK = c.getAttribute("data-key");
    });
    function end(e, drop) {
      clearTimeout(g.timer);
      if (!g.active) return;
      g.active = false;
      if (g.ghost) { g.ghost.remove(); g.ghost = null; }
      suppressClick = true;
      setTimeout(function () { suppressClick = false; }, 350);
      if (!drop) return;
      var a = startK, b = g.endK;
      if (b < a) { var tmp = a; a = b; b = tmp; }
      openSheet(a, null, null);
      el.fAllDay.checked = true;
      el.fEndDate.value = b === a ? "" : b;
      syncFields();
    }
    col.addEventListener("pointerup", function (e) { end(e, true); });
    col.addEventListener("pointercancel", function (e) { end(e, false); });
  }

  // ---------- Vue Mois ----------
  // Glissement d'un événement d'une colonne à une autre en vue Semaine (appui long puis glisser).
  function bindEventMove(btn, id, fromK) {
    var g = { timer: null, active: false, sx: 0, sy: 0, ghost: null, pid: null };
    btn.addEventListener("pointerdown", function (e) {
      if (e.button > 0) return;
      g.sx = e.clientX; g.sy = e.clientY; g.pid = e.pointerId;
      clearTimeout(g.timer);
      g.timer = setTimeout(function () {
        g.active = true;
        buzz(8);
        g.ghost = el_("div", "ghost", "Déplacer l'événement");
        document.body.appendChild(g.ghost);
        moveGhost(g.sx, g.sy);
        try { btn.setPointerCapture(g.pid); } catch (err) { /* ignoré */ }
      }, 300);
    });
    btn.addEventListener("pointermove", function (e) {
      if (!g.active) { if (Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy) > 10) clearTimeout(g.timer); return; }
      moveGhost(e.clientX, e.clientY);
    });
    function end(e, drop) {
      clearTimeout(g.timer);
      if (!g.active) return;
      g.active = false;
      if (g.ghost) { g.ghost.remove(); g.ghost = null; }
      suppressClick = true;
      setTimeout(function () { suppressClick = false; }, 350);
      if (!drop) return;
      var hit = document.elementFromPoint(e.clientX, e.clientY);
      var c = hit && hit.closest ? hit.closest(".wday[data-key]") : null;
      if (c) moveEventTo(id, c.getAttribute("data-key"), fromK);
    }
    btn.addEventListener("pointerup", function (e) { end(e, true); });
    btn.addEventListener("pointercancel", function (e) { end(e, false); });
  }
  // Appui long sur un événement puis glissement : déplace l'événement vers un autre jour.
  // Appui long sur une case libre puis glissement : crée un événement sur plusieurs jours.
  function moveEventTo(id, targetK, fromK) {
    var ev = masterOf(id);
    if (!ev) return;
    if (ev.rule) {
      // Occurrence d'une série : elle est retirée de la série et recréée ponctuellement au nouveau jour.
      var from = fromK || ev.date;
      if (targetK === from) return;
      ev.skip = (ev.skip || []).concat([from]);
      events.push(normalize(Object.assign({}, ev, { id: uid(), uid: null, date: targetK, rule: null, until: null, skip: [], endDate: null })));
      saveEvents();
      refresh();
      return;
    }
    if (targetK === ev.date) return;
    var delta = Math.round((parseKey(targetK) - parseKey(ev.date)) / 86400000);
    ev.date = targetK;
    if (ev.endDate) ev.endDate = keyOf(addDays(parseKey(ev.endDate), delta));
    saveEvents();
    refresh();
  }
  function bindMonthCell(cell, startK) {
    var g = { timer: null, active: false, mode: null, sx: 0, sy: 0, endK: startK, evId: null, ghost: null, pid: null };
    cell.addEventListener("pointerdown", function (e) {
      if (e.button > 0) return;
      var chip = e.target.closest ? e.target.closest(".chip, .dots i") : null;
      g.mode = chip ? "move" : "range";
      g.evId = chip ? chip.getAttribute("data-id") : null;
      g.evDay = startK;
      if (g.mode === "move" && !g.evId) return;
      g.sx = e.clientX; g.sy = e.clientY; g.endK = startK; g.pid = e.pointerId;
      clearTimeout(g.timer);
      g.timer = setTimeout(function () {
        g.active = true;
        buzz(8);
        g.ghost = el_("div", "ghost", g.mode === "move" ? "Déplacer l'événement" : "Période");
        document.body.appendChild(g.ghost);
        moveGhost(g.sx, g.sy);
        try { cell.setPointerCapture(g.pid); } catch (err) { /* ignoré */ }
      }, 300);
    });
    cell.addEventListener("pointermove", function (e) {
      if (!g.active) { if (Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy) > 10) clearTimeout(g.timer); return; }
      moveGhost(e.clientX, e.clientY);
      var hit = document.elementFromPoint(e.clientX, e.clientY);
      var c = hit && hit.closest ? hit.closest(".cell[data-key]") : null;
      if (c) g.endK = c.getAttribute("data-key");
    });
    function end(e, drop) {
      clearTimeout(g.timer);
      if (!g.active) return;
      g.active = false;
      if (g.ghost) { g.ghost.remove(); g.ghost = null; }
      suppressClick = true;
      setTimeout(function () { suppressClick = false; }, 350);
      if (!drop) return;
      var hit = document.elementFromPoint(e.clientX, e.clientY);
      var c = hit && hit.closest ? hit.closest(".cell[data-key]") : null;
      var target = c ? c.getAttribute("data-key") : g.endK;
      if (g.mode === "move") { moveEventTo(g.evId, target, g.evDay); return; }
      var a = startK, b = target;
      if (b < a) { var tmp = a; a = b; b = tmp; }
      openSheet(a, null, null);
      el.fAllDay.checked = true;
      el.fEndDate.value = b === a ? "" : b;
      syncFields();
    }
    cell.addEventListener("pointerup", function (e) { end(e, true); });
    cell.addEventListener("pointercancel", function (e) { end(e, false); });
  }
  function clampIdx(key, rowStart) {
    var diff = Math.round((parseKey(key) - rowStart) / 86400000);
    return Math.max(0, Math.min(6, diff));
  }
  // Barres des événements de journée qui s'étalent sur plusieurs jours, pour une semaine du mois.
  function monthBars(rowStart) {
    var box = el_("div", "mbars");
    var rowKey = keyOf(rowStart), rowEnd = keyOf(addDays(rowStart, 6));
    var spans = events.filter(function (e) {
      return e.allDay && e.endDate && e.endDate > e.date && e.endDate >= rowKey && e.date <= rowEnd &&
        !state.hidden[catIndex(e)] && (state.cat == null || catIndex(e) === state.cat);
    }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    spans.slice(0, 3).forEach(function (ev, idx) {
      var s = clampIdx(ev.date < rowKey ? rowKey : ev.date, rowStart);
      var en = clampIdx(ev.endDate > rowEnd ? rowEnd : ev.endDate, rowStart);
      var bar = el_("button", "mbar", ev.title);
      bar.type = "button";
      bar.style.gridColumn = (s + 1) + " / " + (en + 2);
      bar.style.gridRow = String(idx + 1);
      bar.style.background = colorOf(ev);
      bar.setAttribute("aria-label", ev.title + " du " + ev.date + " au " + ev.endDate);
      bar.addEventListener("click", function (e) { e.stopPropagation(); openSheet(ev.date, masterOf(ev.id), null); });
      box.appendChild(bar);
    });
    if (!spans.length) box.hidden = true;
    return box;
  }
  function renderMonth() {
    var c = state.cursor;
    var start = mondayOf(new Date(c.getFullYear(), c.getMonth(), 1));
    var todayK = keyOf(new Date()), selK = keyOf(c);
    var wrap = el_("div");
    var dow = el_("div", "dow");
    weekLabels().forEach(function (n) { dow.appendChild(el_("div", null, n)); });
    wrap.appendChild(dow);
    var grid = el_("div", "month-wrap");
    var cellsRow = null;
    for (var i = 0; i < 42; i++) {
      if (i % 7 === 0) { grid.appendChild(monthBars(addDays(start, i))); cellsRow = el_("div", "month-grid"); grid.appendChild(cellsRow); }
      var d = addDays(start, i), k = keyOf(d);
      var list = eventsOn(k);
      var open = allTasksOn(k).filter(function (t) { return !taskDone(t, k); });
      var cell = el_("button", "cell");
      cell.type = "button";
      cell.setAttribute("data-key", k);
      bindMonthCell(cell, k);
      if (d.getDay() === 0 || d.getDay() === 6) cell.classList.add("we");
      if (d.getMonth() !== c.getMonth()) cell.classList.add("out");
      if (k === todayK) cell.classList.add("today");
      if (k === selK) cell.classList.add("sel");
      cell.setAttribute("aria-label", d.getDate() + " " + MONTHS[d.getMonth()] +
        (list.length ? ", " + list.length + " événement(s)" : "") + (open.length ? ", " + open.length + " tâche(s) restante(s)" : ""));
      cell.appendChild(el_("span", "n", String(d.getDate())));
      var chips = el_("span", "chips-wrap");
      list.slice(0, 2).forEach(function (ev) {
        var chip = el_("span", "chip", (ev.allDay ? "" : ev.start + " ") + ev.title);
        chip.setAttribute("data-id", ev.id);
        chip.setAttribute("data-rule", ev.rule ? "1" : "");
        chip.style.background = colorOf(ev);
        chips.appendChild(chip);
      });
      if (list.length > 2) chips.appendChild(el_("span", "more", "+" + (list.length - 2)));
      if (open.length) chips.appendChild(el_("span", "tchip", "☐ " + open.length));
      cell.appendChild(chips);
      if (list.length || open.length) {
        var dots = el_("span", "dots");
        list.slice(0, 3).forEach(function (ev) {
          var dot = el_("i");
          dot.style.background = colorOf(ev);
          dot.setAttribute("data-id", ev.id);
          dot.setAttribute("data-rule", ev.rule ? "1" : "");
          dots.appendChild(dot);
        });
        if (open.length) dots.appendChild(el_("i", "t"));
        cell.appendChild(dots);
      }
      cell.addEventListener("click", (function (dt) {
        return function () { if (suppressClick) return; state.cursor = dt; openDrawer(keyOf(dt)); renderHeader(); markSelection(); };
      })(d));
      cellsRow.appendChild(cell);
    }
    wrap.appendChild(grid);
    el.view.appendChild(wrap);
  }
  function markSelection() {
    var selK = keyOf(state.cursor);
    Array.prototype.forEach.call(el.view.querySelectorAll("[data-key]"), function (n) { n.classList.toggle("sel", n.getAttribute("data-key") === selK); });
  }

  // ---------- Vue Semaine ----------
  function renderWeek() {
    var m = mondayOf(state.cursor), todayK = keyOf(new Date()), selK = keyOf(state.cursor);
    var week = el_("div", "week" + (settings.span === 3 ? " span3" : ""));
    var weekTotal = 0, weekDone = 0, byColor = {}, weekKeys = [];
    var nDays = settings.span === 3 ? 3 : 7, startD = settings.span === 3 ? state.cursor : m;
    for (var i = 0; i < nDays; i++) {
      var d = addDays(startD, i), k = keyOf(d);
      weekKeys.push(k);
      var col = el_("div", "wday");
      col.setAttribute("data-key", k);
      if (k === todayK) col.classList.add("today");
      if (k === selK) col.classList.add("sel");
      var head = el_("button", "wday-h");
      head.type = "button";
      head.appendChild(el_("span", "wn", DAYS_SHORT[(d.getDay() + 6) % 7]));
      head.appendChild(el_("span", "wd", String(d.getDate())));
      head.setAttribute("aria-label", DAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()]);
      col.appendChild(head);
      var list = eventsOn(k), tks = tasksOn(k);
      if (!list.length && !tks.length) col.appendChild(el_("div", "wempty", "Libre"));
      list.forEach(function (ev) {
        var eb = evButton(ev);
        col.appendChild(eb);
        bindEventMove(eb, ev.id, k);
        if (!ev.allDay) {
          var mins = Math.max(0, toMin(ev.end) - toMin(ev.start));
          var key = colorOf(ev);
          byColor[key] = byColor[key] || { m: 0, c: key };
          byColor[key].m += mins;
        }
      });
      if (tks.length) {
        var tl = el_("div", "wtasks");
        tks.forEach(function (t) { tl.appendChild(taskRow(t, { day: k, drag: true })); });
        col.appendChild(tl);
      }
      allTasksOn(k).forEach(function (t) { weekTotal++; if (taskDone(t, k)) weekDone++; });
      col.addEventListener("click", (function (dt, key) {
        return function (e) {
          if (e.target.closest && e.target.closest(".ev, .check, .x, .ttl, .tbtn, .sub, .twrap, textarea, input")) return;
          if (keyOf(state.cursor) === key) { state.view = "day"; render(true); return; }
          state.cursor = dt; renderHeader(); markSelection();
        };
      })(d, k));
      bindWeekRange(col, k);
      week.appendChild(col);
    }
    el.view.appendChild(week);
    el.view.appendChild(renderStats(byColor, weekDone, weekTotal, weekKeys));
  }

  function renderStats(byColor, done, total, weekKeys) {
    var box = el_("section", "stats");
    box.appendChild(el_("h3", null, "Bilan de la semaine"));
    var row = el_("div", "stats-row");
    var pct = total ? Math.round(done / total * 100) : 0;
    var ring = el_("div", "ring");
    ring.style.background = "conic-gradient(var(--accent) " + (pct * 3.6) + "deg, var(--surface-2) 0)";
    ring.setAttribute("role", "img");
    ring.setAttribute("aria-label", pct + " % des tâches faites");
    ring.appendChild(el_("span", null, total ? pct + " %" : "–"));
    row.appendChild(ring);
    var legend = el_("div", "legend");
    var entries = Object.keys(byColor).map(function (n) { return byColor[n]; }).sort(function (a, b) { return b.m - a.m; });
    var totalMin = entries.reduce(function (s, x) { return s + x.m; }, 0);
    if (!entries.length) legend.appendChild(el_("span", "hint", "Aucun événement chronométré cette semaine."));
    entries.forEach(function (x) {
      var r = el_("div"), sw = el_("i");
      sw.style.background = x.c;
      r.appendChild(sw);
      var h = Math.floor(x.m / 60), mm = x.m % 60;
      r.appendChild(el_("em", null, h + " h" + (mm ? " " + pad(mm) : "") + " · " + Math.round(x.m / totalMin * 100) + " %"));
      legend.appendChild(r);
    });
    row.appendChild(legend);
    box.appendChild(row);

    // Indicateurs : focus Pomodoro cette semaine, série de jours complets, tâches restantes.
    var focusMin = 0;
    tasks.forEach(function (t) { if (t.pomos && weekKeys.indexOf(t.date) >= 0) focusMin += t.pomos * 25; });
    var kpis = el_("div", "kpis");
    kpis.appendChild(kpiBox(focusMin + " min", "focus Pomodoro"));
    kpis.appendChild(kpiBox(streakDays() + " j", "série de tâches"));
    kpis.appendChild(kpiBox(String(total - done), "tâches restantes"));
    box.appendChild(kpis);

    var track = el_("div", "bar-track");
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    track.setAttribute("aria-valuenow", String(pct));
    var fill = el_("div", "bar-fill");
    fill.style.width = pct + "%";
    track.appendChild(fill);
    box.appendChild(track);
    box.appendChild(el_("p", "hint", total ? done + " tâche(s) faite(s) sur " + total + " cette semaine." : "Aucune tâche cette semaine."));
    return box;
  }
  function kpiBox(value, label) {
    var k = el_("div", "kpi");
    k.appendChild(el_("b", null, value));
    k.appendChild(el_("span", null, label));
    return k;
  }
  // Nombre de jours consécutifs, jusqu'à aujourd'hui (ou hier), où toutes les tâches sont faites.
  function streakDays() {
    var d = startOfToday(), n = 0;
    for (var i = 0; i < 366; i++) {
      var k = keyOf(d), list = allTasksOn(k);
      if (!list.length) { if (i === 0) { d = addDays(d, -1); continue; } break; }
      if (list.every(function (t) { return taskDone(t, k); })) { n++; d = addDays(d, -1); }
      else { if (i === 0) { d = addDays(d, -1); continue; } break; }
    }
    return n;
  }

  // ---------- Vue Jour ----------
  function renderTasks(k) {
    var all = allTasksOn(k);
    var list = tasksOn(k);
    var doneCount = all.filter(function (t) { return taskDone(t, k); }).length;
    var box = el_("details", "tasks");
    box.open = tasksOpen;
    box.addEventListener("toggle", function () { tasksOpen = box.open; });
    var sum = el_("summary");
    var h = el_("h3");
    h.appendChild(document.createTextNode("À faire dans la journée"));
    h.appendChild(svgIcon("M6 9l6 6 6-6", "chev"));
    sum.appendChild(h);
    sum.appendChild(el_("span", "meta", all.length ? doneCount + " / " + all.length + " faites" : "Aucune"));
    box.appendChild(sum);

    var body = el_("div", "tasks-body");
    var form = el_("form", "task-form");
    form.setAttribute("novalidate", "");
    var input = el_("input");
    input.type = "text";
    input.id = "task-input";
    input.maxLength = 120;
    input.placeholder = "Ex. Lire 10 pages";
    input.setAttribute("aria-label", "Nouvelle tâche");
    var submit = el_("button", "btn primary", "Ajouter");
    submit.type = "submit";
    form.appendChild(input);
    form.appendChild(submit);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var title = input.value.trim();
      if (!title) { input.focus(); return; }
      tasks.push(normalizeTask({ title: title, date: k, rule: state.taskRule || null, created: Date.now() }));
      saveTasks();
      tasksOpen = true;
      refresh();
      var again = document.getElementById("task-input");
      if (again) again.focus();
    });
    body.appendChild(form);

    // Répétition de la nouvelle tâche
    var rules = el_("div", "opts");
    rules.setAttribute("role", "group");
    rules.setAttribute("aria-label", "Répétition de la tâche");
    TASK_RULES.forEach(function (r) {
      var b = el_("button", "opt", r.label);
      b.type = "button";
      b.setAttribute("aria-pressed", state.taskRule === r.value ? "true" : "false");
      b.addEventListener("click", function () { state.taskRule = r.value; refresh(); });
      rules.appendChild(b);
    });
    body.appendChild(rules);

    var tools = el_("div", "task-tools");
    var openCount = list.filter(function (t) { return !taskDone(t, k); }).length;
    var toggleAll = el_("button", "btn small", openCount ? "Tout cocher" : "Tout décocher");
    toggleAll.type = "button";
    toggleAll.disabled = !list.length;
    toggleAll.addEventListener("click", function () {
      var markDone = openCount > 0;
      tasks.forEach(function (t) {
        if (!taskOccurs(t, k)) return;
        if (t.rule) {
          var idx = t.doneDates.indexOf(k);
          if (markDone && idx < 0) t.doneDates.push(k);
          if (!markDone && idx >= 0) t.doneDates.splice(idx, 1);
        } else t.done = markDone;
      });
      saveTasks();
      refresh();
    });
    tools.appendChild(toggleAll);
    body.appendChild(tools);

    if (!list.length) {
      body.appendChild(el_("div", "tasks-empty", state.openOnly ? "Plus rien à faire ce jour." : "Aucune tâche pour ce jour. Ajoute ce que tu veux faire, sans heure précise."));
    } else {
      var ul = el_("div", "task-list");
      list.forEach(function (t) { ul.appendChild(taskRow(t, { plan: true, drag: true, day: k })); });
      body.appendChild(ul);
    }
    box.appendChild(body);
    return box;
  }

  function renderDay() {
    var c = state.cursor, k = keyOf(c);
    var isToday = k === keyOf(new Date());
    var list = eventsOn(k);
    var allDay = list.filter(function (e) { return e.allDay; });
    var timed = list.filter(function (e) { return !e.allDay; });

    var head = el_("div", "day-head");
    head.appendChild(el_("span", "count", list.length ? list.length + " événement(s)" : "Aucun événement"));
    var copyBtn = el_("button", "btn small", "Copier");
    copyBtn.type = "button";
    copyBtn.setAttribute("aria-label", "Copier cette journée vers une autre date");
    copyBtn.addEventListener("click", function () { pickDate(null, false, function (target) { copyDay(k, target); }); });
    head.appendChild(copyBtn);
    var addBtn = el_("button", "btn primary", "+ Événement");
    addBtn.type = "button";
    addBtn.addEventListener("click", function () { openSheet(k, null, null); });
    head.appendChild(addBtn);
    el.view.appendChild(head);

    if (isToday) {
      var now0 = new Date(), nowMin0 = now0.getHours() * 60 + now0.getMinutes();
      var current = timed.filter(function (e) { return toMin(e.start) <= nowMin0 && toMin(e.end) > nowMin0; })[0];
      var next = timed.filter(function (e) { return toMin(e.start) > nowMin0; })[0];
      var txt = current ? "En cours : " + current.title + " jusqu'à " + current.end
        : next ? "Prochain : " + next.title + " dans " + (toMin(next.start) - nowMin0) + " min"
        : "Plus d'événement aujourd'hui";
      var banner = el_("div", "banner");
      banner.appendChild(el_("span", null, txt));
      if (next || current) banner.appendChild(el_("b", null, (current || next).start));
      el.view.appendChild(banner);
    }

    el.view.appendChild(renderTasks(k));

    if (allDay.length) {
      var strip = el_("div", "allday");
      allDay.forEach(function (ev) { strip.appendChild(evButton(ev)); });
      el.view.appendChild(strip);
    }

    var wrap = el_("div", "tl-wrap");
    wrap.addEventListener("scroll", function () { scrollMemo = wrap.scrollTop; }, { passive: true });
    var tl = el_("div", "tl");
    var hours = el_("div", "hours");
    for (var h = 0; h < 24; h++) {
      var lbl = el_("span", null, pad(h) + ":00");
      lbl.style.top = (h * 60) + "px";
      if (h === 0) lbl.style.transform = "translateY(0)";
      hours.appendChild(lbl);
    }
    tl.appendChild(hours);

    var slots = el_("div", "slots");
    currentSlots = slots;
    currentSlots.setAttribute("data-day", k);
    for (var s = 0; s < 24; s++) {
      var slot = el_("button", "slot");
      slot.type = "button";
      slot.style.top = (s * 60) + "px";
      slot.setAttribute("aria-label", "Créer un événement à " + pad(s) + ":00");
      slot.addEventListener("click", (function (hour) { return function () { if (suppressClick) return; openSheet(k, null, hour * 60); }; })(s));
      slots.appendChild(slot);
    }

    if (settings.workShade) {
      var off1 = el_("div", "off"); off1.style.top = "0px"; off1.style.height = (9 * 60) + "px";
      var off2 = el_("div", "off"); off2.style.top = (18 * 60) + "px"; off2.style.height = (6 * 60) + "px";
      slots.appendChild(off1);
      slots.appendChild(off2);
    }
    // Glisser sur la timeline (appui maintenu puis glisser) : crée un événement de la durée tracée.
    slots.addEventListener("pointerdown", function (e) {
      if (e.button > 0 || (e.target.closest && e.target.closest(".evb"))) return;
      var rect = slots.getBoundingClientRect();
      var g = { y0: e.clientY - rect.top, y1: e.clientY - rect.top, active: false, timer: null, sy: e.clientY };
      var prev = el_("div", "dcreate");
      function place() {
        var a = clamp(Math.round(Math.min(g.y0, g.y1) / SNAP) * SNAP, 0, 1440);
        var b = clamp(Math.round(Math.max(g.y0, g.y1) / SNAP) * SNAP, 0, 1440);
        prev.style.top = a + "px";
        prev.style.height = Math.max(SNAP, b - a) + "px";
      }
      function cleanup() {
        clearTimeout(g.timer);
        slots.removeEventListener("pointermove", move);
        slots.removeEventListener("pointerup", up);
        slots.removeEventListener("pointercancel", cancel);
        prev.remove();
      }
      function move(ev) {
        if (!g.active) { if (Math.abs(ev.clientY - g.sy) > 8) cleanup(); return; }
        g.y1 = ev.clientY - rect.top;
        place();
      }
      function cancel() { cleanup(); g.active = false; }
      function up() {
        var wasActive = g.active;
        cleanup();
        if (!wasActive) return;
        g.active = false;
        var a = clamp(Math.round(Math.min(g.y0, g.y1) / SNAP) * SNAP, 0, 1440 - SNAP);
        var b = clamp(Math.round(Math.max(g.y0, g.y1) / SNAP) * SNAP, a + SNAP, 1440);
        suppressClick = true;
        setTimeout(function () { suppressClick = false; }, 350);
        openSheet(k, null, a);
        el.fEnd.value = fromMin(b);
        syncFields();
      }
      g.timer = setTimeout(function () {
        g.active = true;
        slots.appendChild(prev);
        place();
        buzz(8);
        try { slots.setPointerCapture(e.pointerId); } catch (err) { /* ignoré */ }
      }, 250);
      slots.addEventListener("pointermove", move);
      slots.addEventListener("pointerup", up);
      slots.addEventListener("pointercancel", cancel);
    });
    var laneEnds = [], placed = [];
    timed.forEach(function (ev) {
      var st = toMin(ev.start), en = Math.max(toMin(ev.end), st + 30);
      var from = Math.max(0, st - ev.bBefore), to = Math.min(1440, en + ev.bAfter);
      var lane = -1;
      for (var i = 0; i < laneEnds.length; i++) { if (laneEnds[i] <= from) { lane = i; laneEnds[i] = to; break; } }
      if (lane < 0) { lane = laneEnds.length; laneEnds.push(to); }
      placed.push({ ev: ev, st: st, en: en, from: from, to: to, lane: lane });
    });
    var total = Math.max(1, laneEnds.length);

    placed.forEach(function (p) {
      var b = el_("button", "evb");
      b.type = "button";
      b.style.background = colorOf(p.ev);
      b.style.top = p.from + "px";
      b.style.height = (p.to - p.from) + "px";
      b.style.left = "calc(" + (p.lane * 100 / total) + "% + 3px)";
      b.style.width = "calc(" + (100 / total) + "% - 6px)";
      if (p.ev.bBefore) {
        var bb = el_("span", "buf", "Trajet " + p.ev.bBefore + " min");
        bb.style.height = (p.st - p.from) + "px";
        b.appendChild(bb);
      }
      var main = el_("span", "main");
      main.appendChild(el_("b", null, p.ev.title));
      main.appendChild(el_("small", null, p.ev.start + "–" + p.ev.end + (p.ev.place ? " · " + p.ev.place : "")));
      b.appendChild(main);
      if (p.ev.bAfter) {
        var ba = el_("span", "buf", "Retour " + p.ev.bAfter + " min");
        ba.style.height = (p.to - p.en) + "px";
        b.appendChild(ba);
      }
      var grip = el_("span", "grip");
      grip.setAttribute("aria-hidden", "true");
      b.appendChild(grip);
      bindEventDrag(b, p);
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        if (suppressClick) return;
        openSheet(p.ev.occDate || p.ev.date, masterOf(p.ev.id), null);
      });
      slots.appendChild(b);
    });

    var nowMin = null;
    if (isToday) {
      var now = new Date();
      nowMin = now.getHours() * 60 + now.getMinutes();
      var line = el_("div", "now");
      line.style.top = nowMin + "px";
      line.appendChild(el_("span", "now-label", pad(now.getHours()) + ":" + pad(now.getMinutes())));
      slots.appendChild(line);
    }
    tl.appendChild(slots);
    wrap.appendChild(tl);
    el.view.appendChild(wrap);

    if (keepScroll && scrollMemo != null) {
      wrap.scrollTop = scrollMemo;
    } else {
      var target = Math.max(0, nowMin != null ? nowMin - 180 : 7 * 60 - 40);
      scrollMemo = target;
      requestAnimationFrame(function () {
        if (typeof wrap.scrollTo === "function") wrap.scrollTo({ top: target, behavior: "smooth" });
        else wrap.scrollTop = target;
      });
    }
  }

  // Copie les événements (occurrences ponctuelles) et les tâches ponctuelles d'un jour vers un autre.
  function copyDay(from, to) {
    var n = 0;
    eventsOn(from).forEach(function (ev) {
      var copy = normalize(Object.assign({}, ev, { id: uid(), uid: null, date: to, rule: null, until: null, skip: [] }));
      if (ev.allDay && ev.endDate) {
        var span = Math.round((parseKey(ev.endDate) - parseKey(ev.date)) / 86400000);
        copy.endDate = keyOf(addDays(parseKey(to), span));
      }
      events.push(copy);
      n++;
    });
    allTasksOn(from).forEach(function (t) {
      if (t.rule) return;
      tasks.push(normalizeTask({ title: t.title, date: to, done: false, subs: t.subs.map(function (s) { return Object.assign({}, s, { done: false }); }), notes: t.notes }));
      n++;
    });
    saveEvents();
    saveTasks();
    state.cursor = parseKey(to);
    render(true);
    showUndo(n + " élément(s) copié(s) vers le " + parseKey(to).getDate() + " " + MONTHS[parseKey(to).getMonth()], null);
  }

  // Glisser un événement (appui long) ou étirer sa poignée, par pas de 15 min.
  function bindEventDrag(b, p) {
    var g = { mode: null, sy: 0, active: false, timer: null, dy: 0, moved: false, snap: 0 };
    var dur = p.en - p.st;
    b.addEventListener("pointerdown", function (e) {
      if (e.button > 0) return;
      var isGrip = e.target.classList && e.target.classList.contains("grip");
      g.mode = isGrip ? "resize" : "move";
      g.sy = e.clientY; g.dy = 0; g.moved = false; g.snap = 0;
      g.active = isGrip;
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignoré */ }
      if (!isGrip) {
        clearTimeout(g.timer);
        g.timer = setTimeout(function () { g.active = true; b.classList.add("lift"); buzz(10); }, 260);
      }
      if (isGrip) e.stopPropagation();
    });
    b.addEventListener("pointermove", function (e) {
      if (!g.active) { if (Math.abs(e.clientY - g.sy) > 8) { clearTimeout(g.timer); g.timer = null; } return; }
      g.dy = e.clientY - g.sy;
      if (Math.abs(g.dy) > 4) g.moved = true;
      g.snap = Math.round(g.dy / SNAP) * SNAP;
      if (g.mode === "move") b.style.transform = "translateY(" + g.snap + "px)";
      else b.style.height = Math.max(SNAP * 2, (p.to - p.from) + g.snap) + "px";
    });
    function finish(commit) {
      clearTimeout(g.timer);
      b.classList.remove("lift");
      b.style.transform = "";
      var wasActive = g.active;
      g.active = false;
      if (!wasActive) return;
      var sn = g.snap;
      g.snap = 0;
      if (commit && g.moved && sn) {
        var ev = masterOf(p.ev.id);
        if (ev) {
          if (g.mode === "move") {
            var ns = clamp(toMin(ev.start) + sn, 0, 1440 - dur);
            ev.start = fromMin(ns);
            ev.end = fromMin(ns + dur);
          } else {
            ev.end = fromMin(clamp(toMin(ev.end) + sn, toMin(ev.start) + SNAP, 1440));
          }
          saveEvents();
          suppressClick = true;
          setTimeout(function () { suppressClick = false; }, 350);
          refresh();
          return;
        }
      }
      if (g.mode === "resize" || g.moved) { suppressClick = true; setTimeout(function () { suppressClick = false; }, 350); }
      refresh();
    }
    b.addEventListener("pointerup", function () { finish(true); });
    b.addEventListener("pointercancel", function () { finish(false); });
  }

  // Glisser une tâche sur la timeline (appui long) : elle devient un événement au créneau relâché.
  var ghost = null;
  function bindTaskDrag(row, t, k) {
    var g = { timer: null, active: false, x: 0, y: 0 };
    row.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".check, .x, .tbtn, textarea, input")) return;
      g.x = e.clientX; g.y = e.clientY;
      clearTimeout(g.timer);
      g.timer = setTimeout(function () {
        g.active = true;
        row.classList.add("dragging");
        buzz(8);
        ghost = el_("div", "ghost", t.title);
        document.body.appendChild(ghost);
        moveGhost(e.clientX, e.clientY);
        try { row.setPointerCapture(e.pointerId); } catch (err) { /* ignoré */ }
      }, 300);
    });
    row.addEventListener("pointermove", function (e) {
      if (!g.active) { if (Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) > 10) clearTimeout(g.timer); return; }
      moveGhost(e.clientX, e.clientY);
    });
    function end(e, drop) {
      clearTimeout(g.timer);
      row.classList.remove("dragging");
      if (!g.active) return;
      g.active = false;
      if (ghost) { ghost.remove(); ghost = null; }
      if (!drop) return;
      var r = currentSlots ? currentSlots.getBoundingClientRect() : null;
      if (r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        var min = clamp(Math.round((e.clientY - r.top) / SNAP) * SNAP, 0, 1440 - 60);
        suppressClick = true;
        setTimeout(function () { suppressClick = false; }, 350);
        planTask(t, k, min);
        return;
      }
      // Déposée sur une autre journée de la semaine : la tâche change de jour.
      var hit = document.elementFromPoint(e.clientX, e.clientY);
      var col = hit && hit.closest ? hit.closest(".wday[data-key]") : null;
      if (col && !t.rule) {
        var target = col.getAttribute("data-key");
        var cur = taskById(t.id);
        if (cur && target !== k) { cur.date = target; saveTasks(); suppressClick = true; setTimeout(function () { suppressClick = false; }, 350); refresh(); }
      }
    }
    row.addEventListener("pointerup", function (e) { end(e, true); });
    row.addEventListener("pointercancel", function (e) { end(e, false); });
  }
  function moveGhost(x, y) { if (ghost) { ghost.style.left = x + "px"; ghost.style.top = (y - 12) + "px"; } }

  // ---------- Rendu ----------
  function render(animate) {
    el.view.innerHTML = "";
    el.view.classList.remove("enter");
    renderHeader();
    renderFilters();
    if (state.view === "month") renderMonth();
    else if (state.view === "week") renderWeek();
    else if (state.view === "year") renderYear();
    else if (state.view === "agenda") renderAgenda();
    else renderDay();
    if (animate) { void el.view.offsetWidth; el.view.classList.add("enter"); }
    keepScroll = false;
    pomoDraw();
  }
  function refresh() { keepScroll = true; render(false); }

  function step(dir) {
    var c = state.cursor;
    if (state.view === "month") state.cursor = addMonthsClamped(c, dir);
    else if (state.view === "week") state.cursor = addDays(c, 7 * dir);
    else if (state.view === "year") state.cursor = new Date(c.getFullYear() + dir, c.getMonth(), Math.min(c.getDate(), 28));
    else if (state.view === "agenda") state.cursor = addDays(c, 7 * dir);
    else state.cursor = addDays(c, dir);
    render(true);
  }

  // ---------- Vue Programme (liste des 60 prochains jours) ----------
  function renderAgenda() {
    var start = startOfToday(), todayK = keyOf(start);
    var box = el_("div", "agenda");
    var any = false;
    for (var i = 0; i < 60; i++) {
      var d = addDays(start, i), k = keyOf(d);
      var evs = eventsOn(k);
      var tks = tasksOn(k).filter(function (t) { return !taskDone(t, k); });
      if (!evs.length && !tks.length) continue;
      any = true;
      var day = el_("section", "ag-day");
      var h = el_("button", "ag-h" + (k === todayK ? " today" : ""),
        (k === todayK ? "Aujourd'hui · " : "") + cap(DAYS[d.getDay()]) + " " + d.getDate() + " " + MONTHS[d.getMonth()]);
      h.type = "button";
      h.addEventListener("click", (function (dt) { return function () { state.cursor = dt; state.view = "day"; render(true); }; })(d));
      day.appendChild(h);
      evs.forEach(function (ev) { day.appendChild(evButton(ev)); });
      tks.forEach(function (t) {
        var b = el_("button", "ag-task", "☐ " + t.title);
        b.type = "button";
        b.addEventListener("click", (function (dt) { return function () { state.cursor = dt; state.view = "day"; render(true); }; })(d));
        day.appendChild(b);
      });
      box.appendChild(day);
    }
    if (!any) box.appendChild(el_("div", "empty-state", "Rien de prévu dans les 60 prochains jours."));
    el.view.appendChild(box);
  }

  // ---------- Vue Année ----------
  function renderYear() {
    var y = state.cursor.getFullYear(), todayK = keyOf(new Date()), selK = keyOf(state.cursor);
    var start = mondayOf(new Date(y, 0, 1));
    var scroll = el_("div", "year-scroll");
    var grid = el_("div", "year-grid");
    grid.setAttribute("role", "grid");
    grid.setAttribute("aria-label", "Activité de " + y);
    for (var i = 0; i < 371; i++) {
      var d = addDays(start, i), k = keyOf(d);
      var cell = el_("button", "yd");
      cell.type = "button";
      if (d.getFullYear() !== y) { cell.classList.add("empty"); cell.tabIndex = -1; grid.appendChild(cell); continue; }
      var count = eventsOn(k).length + allTasksOn(k).length;
      var level = count === 0 ? 0 : count === 1 ? 25 : count === 2 ? 50 : count === 3 ? 75 : 100;
      cell.style.background = level ? "color-mix(in srgb, var(--accent) " + level + "%, var(--surface-2))" : "";
      if (k === todayK) cell.classList.add("today");
      if (k === selK) cell.classList.add("sel");
      cell.title = d.getDate() + " " + MONTHS[d.getMonth()] + " : " + count + " élément(s)";
      cell.setAttribute("aria-label", cell.title);
      cell.addEventListener("click", (function (dt) { return function () { state.cursor = dt; state.view = "day"; render(true); }; })(d));
      grid.appendChild(cell);
    }
    scroll.appendChild(grid);
    el.view.appendChild(scroll);
    var legend = el_("div", "year-legend");
    legend.appendChild(el_("span", null, "Moins"));
    [0, 25, 50, 75, 100].forEach(function (l) {
      var sw = el_("i");
      sw.style.background = l ? "color-mix(in srgb, var(--accent) " + l + "%, var(--surface-2))" : "var(--surface-2)";
      legend.appendChild(sw);
    });
    legend.appendChild(el_("span", null, "Plus · événements et tâches par jour"));
    el.view.appendChild(legend);
  }

  // ---------- Feuille d'événement ----------
  function buildSwatches(selectedIndex) {
    el.swatches.innerHTML = "";
    COLORS.forEach(function (c, i) {
      var label = el_("label", "swatch");
      var input = el_("input");
      input.type = "radio";
      input.name = "color";
      input.value = String(i);
      input.checked = i === selectedIndex;
      input.setAttribute("aria-label", "Catégorie " + (i + 1));
      var sw = el_("span", "sw");
      sw.style.background = c;
      label.appendChild(input);
      label.appendChild(sw);
      el.swatches.appendChild(label);
    });
  }
  function setStatus(msg, isError) { el.status.textContent = msg; el.status.className = "status" + (isError ? " error" : ""); }

  function syncFields() {
    var allDay = el.fAllDay.checked;
    el.times.hidden = allDay;
    el.buffers.hidden = allDay;
    el.endWrap.hidden = !allDay;
    el.untilWrap.hidden = !el.fRule.value;
    document.getElementById("btn-remindat").textContent = document.getElementById("f-remindat").value || "Aucun";
    document.getElementById("every-wrap").hidden = el.fRule.value !== "every";
    el.delSeries.hidden = !(editingId && masterOf(editingId) && masterOf(editingId).rule);
    refreshDisplays();
  }
  el.fAllDay.addEventListener("change", syncFields);

  // ---------- Valeurs affichées et options ----------
  var DN = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  function fmtDate(k) {
    if (!k) return "Aucune";
    var d = parseKey(k);
    return DN[(d.getDay() + 6) % 7] + " " + d.getDate() + " " + MONTHS_SHORT[d.getMonth()] + " " + d.getFullYear();
  }
  var OPT_HIDDEN = { "rule-chips": "f-rule", "buf-before": "f-bbefore", "buf-after": "f-bafter", "rem-chips": "f-remind", "unit-chips": "f-unit" };
  var DUR = [15, 30, 60, 90];
  function refreshDisplays() {
    function byId(id) { return document.getElementById(id); }
    byId("btn-start").textContent = byId("f-start").value || "—";
    byId("btn-end").textContent = byId("f-end").value || "—";
    byId("btn-date").textContent = fmtDate(byId("f-date").value);
    byId("btn-enddate").textContent = fmtDate(byId("f-enddate").value);
    byId("btn-until").textContent = fmtDate(byId("f-until").value);
    Object.keys(OPT_HIDDEN).forEach(function (cid) {
      var current = byId(OPT_HIDDEN[cid]).value;
      Array.prototype.forEach.call(byId(cid).querySelectorAll("[data-val]"), function (b) {
        b.setAttribute("aria-pressed", b.getAttribute("data-val") === current ? "true" : "false");
      });
    });
    var s = byId("f-start").value, en = byId("f-end").value;
    var dur = s && en ? toMin(en) - toMin(s) : -1;
    Array.prototype.forEach.call(byId("dur-chips").querySelectorAll("[data-dur]"), function (b) {
      b.setAttribute("aria-pressed", +b.getAttribute("data-dur") === dur ? "true" : "false");
    });
  }
  function optGroup(container, options, hidden, onChange) {
    container.innerHTML = "";
    options.forEach(function (o) {
      var b = el_("button", "opt", o.label);
      b.type = "button";
      b.setAttribute("data-val", o.value);
      b.addEventListener("click", function () {
        hidden.value = o.value;
        refreshDisplays();
        if (onChange) onChange();
      });
      container.appendChild(b);
    });
  }

  // ---------- Sélecteurs ----------
  function openPicker(title, build) {
    el.pickerTitle.textContent = title;
    el.pickerBody.innerHTML = "";
    build(el.pickerBody);
    openDialog(el.picker);
  }
  function pickTime(hid) {
    var cur = hid.value || "09:00";
    var h = +cur.slice(0, 2), m = +cur.slice(3, 5);
    var mins = [0, 15, 30, 45];
    if (mins.indexOf(m) < 0) { mins.push(m); mins.sort(function (a, b) { return a - b; }); }
    openPicker("Heure", function (body) {
      var preview = el_("div", "preview", pad(h) + ":" + pad(m));
      body.appendChild(preview);
      body.appendChild(el_("p", "pick-sec", "Heure"));
      var hg = el_("div", "pgrid");
      var hourBtns = [];
      for (var i = 0; i < 24; i++) {
        var hb = el_("button", null, pad(i));
        hb.type = "button";
        hb.setAttribute("data-h", String(i));
        hb.addEventListener("click", function () { h = +this.getAttribute("data-h"); update(); });
        hourBtns.push(hb);
        hg.appendChild(hb);
      }
      body.appendChild(hg);
      body.appendChild(el_("p", "pick-sec", "Minutes"));
      var mg = el_("div", "pgrid mins");
      var minBtns = mins.map(function (mi) {
        var b = el_("button", null, pad(mi));
        b.type = "button";
        b.setAttribute("data-m", String(mi));
        b.addEventListener("click", function () { m = +this.getAttribute("data-m"); update(); });
        mg.appendChild(b);
        return b;
      });
      body.appendChild(mg);
      function update() {
        preview.textContent = pad(h) + ":" + pad(m);
        hourBtns.forEach(function (b) { b.setAttribute("aria-pressed", +b.getAttribute("data-h") === h ? "true" : "false"); });
        minBtns.forEach(function (b) { b.setAttribute("aria-pressed", +b.getAttribute("data-m") === m ? "true" : "false"); });
      }
      update();
      var act = el_("div", "pick-actions");
      var cancel = el_("button", "btn", "Annuler");
      cancel.type = "button";
      cancel.addEventListener("click", function () { closeDialog(el.picker); });
      var ok = el_("button", "btn primary", "Valider");
      ok.type = "button";
      ok.addEventListener("click", function () {
        hid.value = pad(h) + ":" + pad(m);
        if (hid === el.fStart && el.fEnd.value <= hid.value) el.fEnd.value = fromMin(Math.min(1439, toMin(hid.value) + 60));
        closeDialog(el.picker);
        syncFields();
      });
      act.appendChild(cancel);
      act.appendChild(ok);
      body.appendChild(act);
    });
  }
  // Si onPick est fourni, il reçoit la date choisie (sinon on remplit hid).
  function pickDate(hid, allowClear, onPick, title) {
    var cur = hid && hid.value ? parseKey(hid.value) : state.cursor;
    var view = new Date(cur.getFullYear(), cur.getMonth(), 1);
    var todayK = keyOf(new Date());
    var currentVal = hid ? hid.value : "";
    openPicker(title || (onPick ? "Copier vers" : "Date"), function (body) {
      var head = el_("div", "cal-head");
      var prevB = el_("button", "btn icon", "‹");
      prevB.type = "button";
      var nextB = el_("button", "btn icon", "›");
      nextB.type = "button";
      var title = el_("span", null, "");
      head.appendChild(prevB);
      head.appendChild(title);
      head.appendChild(nextB);
      body.appendChild(head);
      var grid = el_("div", "cal-grid");
      body.appendChild(grid);
      function choose(k) {
        if (onPick) { closeDialog(el.picker); onPick(k); return; }
        hid.value = k;
        closeDialog(el.picker);
        syncFields();
      }
      function draw() {
        grid.innerHTML = "";
        title.textContent = cap(MONTHS[view.getMonth()]) + " " + view.getFullYear();
        weekLabels().forEach(function (n) { grid.appendChild(el_("span", "dn", n)); });
        var start = addDays(view, -dowIdx(view));
        for (var i = 0; i < 42; i++) {
          var d = addDays(start, i), k = keyOf(d);
          var b = el_("button", null, String(d.getDate()));
          b.type = "button";
          if (d.getMonth() !== view.getMonth()) b.classList.add("out");
          if (k === todayK) b.classList.add("today");
          b.setAttribute("aria-pressed", k === currentVal ? "true" : "false");
          b.setAttribute("aria-label", d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear());
          b.addEventListener("click", (function (kk) { return function () { choose(kk); }; })(k));
          grid.appendChild(b);
        }
      }
      prevB.addEventListener("click", function () { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); draw(); });
      nextB.addEventListener("click", function () { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); draw(); });
      draw();
      var act = el_("div", "pick-actions");
      if (allowClear) {
        var clr = el_("button", "btn danger", "Effacer");
        clr.type = "button";
        clr.addEventListener("click", function () { hid.value = ""; closeDialog(el.picker); syncFields(); });
        act.appendChild(clr);
      } else act.appendChild(el_("span"));
      var cancel = el_("button", "btn", "Annuler");
      cancel.type = "button";
      cancel.addEventListener("click", function () { closeDialog(el.picker); });
      act.appendChild(cancel);
      body.appendChild(act);
    });
  }

  // startMin : minutes depuis minuit (ou null). k : date ou occurrence.
  var REMIND_OPTS = [{ value: 10, label: "10 min" }, { value: 30, label: "30 min" }, { value: 60, label: "1 h" }, { value: 1440, label: "La veille" }];
  var reminds = [];
  function renderRemind() {
    Array.prototype.forEach.call(document.getElementById("rem-chips").querySelectorAll("[data-m]"), function (b) {
      b.setAttribute("aria-pressed", reminds.indexOf(+b.getAttribute("data-m")) >= 0 ? "true" : "false");
    });
  }
  function openSheet(k, master, startMin, fromTask) {
    editingId = master ? master.id : null;
    editingOcc = master && master.rule ? k : null;
    armedBtn = null;
    pendingTaskId = fromTask ? fromTask.id : null;
    var ev = master;
    el.del.textContent = editingOcc ? "Supprimer cette occurrence" : "Supprimer";
    el.delSeries.textContent = "Supprimer la série";
    el.sheetTitle.textContent = ev ? "Modifier l'événement" : (fromTask ? "Planifier la tâche" : "Nouvel événement");
    el.fNlp.value = "";
    el.fTitle.value = ev ? ev.title : (fromTask ? fromTask.title : "");
    el.fAllDay.checked = !!(ev && ev.allDay);
    el.fDate.value = ev ? ev.date : k;
    var start = ev ? ev.start : (startMin != null ? fromMin(startMin) : "09:00");
    var end = ev ? ev.end : fromMin(toMin(start) + settings.dur);
    el.fStart.value = start;
    el.fEnd.value = end;
    el.fEndDate.value = ev && ev.endDate ? ev.endDate : "";
    el.fRule.value = ev && ev.rule ? ev.rule : "";
    el.fUntil.value = ev && ev.until ? ev.until : "";
    el.fBBefore.value = String(ev ? ev.bBefore : 0);
    el.fBAfter.value = String(ev ? ev.bAfter : 0);
    document.getElementById("f-remind").value = String(ev ? ev.remind : 0);
    reminds = ev && ev.reminds ? ev.reminds.slice() : [];
    document.getElementById("f-remindat").value = ev && ev.remindAt ? ev.remindAt : "";
    document.getElementById("f-n").value = String(ev && ev.every ? ev.every : 2);
    document.getElementById("f-unit").value = ev && ev.unit === "week" ? "week" : "day";
    el.fPlace.value = ev ? (ev.place || "") : "";
    document.getElementById("f-tz").value = ev ? (ev.tz || "") : "";
    el.fNotes.value = ev ? (ev.notes || "") : "";
    draftSubs = ev ? (ev.checklist || []).slice() : (fromTask ? (fromTask.subs || []).slice() : []);
    buildSwatches(ev ? catIndex(ev) : 0);
    renderSheetChecklist();
    renderNotesPreview();
    el.del.hidden = !ev;
    el.dup.hidden = !ev;
    setStatus("", false);
    closeDialog(el.drawer);
    renderRemind();
    syncFields();
    openDialog(el.sheet);
  }
  function closeSheet() { pendingTaskId = null; closeDialog(el.sheet); }

  // Modification d'une série récurrente : on mémorise la nouvelle valeur, sans recréer l'événement.
  el.form.addEventListener("submit", function (e) {
    // Les sous-formulaires imbriqués font remonter leur submit ici : on ne traite que le formulaire principal.
    if (e.target !== el.form) return;
    e.preventDefault();
    var title = el.fTitle.value.trim();
    var date = el.fDate.value;
    var allDay = el.fAllDay.checked;
    var start = allDay ? "00:00" : el.fStart.value;
    var end = allDay ? "23:59" : el.fEnd.value;
    var endDate = allDay && el.fEndDate.value ? el.fEndDate.value : null;
    var rule = el.fRule.value || null;
    var until = rule && el.fUntil.value ? el.fUntil.value : null;
    if (!title) { setStatus("Donnez un titre à l'événement.", true); el.fTitle.focus(); return; }
    if (!date) { setStatus("Choisissez une date.", true); return; }
    if (!allDay && (!start || !end)) { setStatus("Indiquez l'heure de début et de fin.", true); return; }
    if (!allDay && end <= start) { setStatus("La fin doit être après le début.", true); return; }
    if (endDate && endDate < date) { setStatus("La date de fin doit être après la date de début.", true); return; }
    if (until && until < date) { setStatus("La fin de répétition doit être après la date de début.", true); return; }
    var tzv = document.getElementById("f-tz").value.trim();
    if (tzv) { try { new Intl.DateTimeFormat("fr-FR", { timeZone: tzv }); } catch (err) { setStatus("Fuseau inconnu : utilise par exemple Europe/Paris.", true); return; } }
    var checked = el.swatches.querySelector("input:checked");
    var previous = editingId ? masterOf(editingId) : null;
    var data = normalize({
      id: editingId || uid(), uid: previous ? previous.uid : null, title: title, date: date, start: start, end: end, allDay: allDay, endDate: endDate,
      place: el.fPlace.value.trim(), notes: el.fNotes.value.trim(), color: COLORS[checked ? +checked.value : 0],
      rule: allDay && endDate ? null : rule, until: allDay && endDate ? null : until,
      skip: previous ? previous.skip : [],
      bBefore: allDay ? 0 : +el.fBBefore.value, bAfter: allDay ? 0 : +el.fBAfter.value,
      remind: reminds.length ? reminds[0] : 0, reminds: reminds.slice(),
      remindAt: document.getElementById("f-remindat").value || "",
      tz: document.getElementById("f-tz").value.trim(),
      every: +document.getElementById("f-n").value || 1, unit: document.getElementById("f-unit").value === "week" ? "week" : "day",
      checklist: draftSubs
    });
    if (editingId) events = events.map(function (x) { return x.id === editingId ? data : x; });
    else events.push(data);
    if (pendingTaskId) { tasks = tasks.filter(function (t) { return t.id !== pendingTaskId; }); saveTasks(); }
    saveEvents();
    state.cursor = parseKey(date);
    closeSheet();
    render(false);
  });

  // Suppression avec confirmation (deux appuis). occurrence : seulement ce jour ; série : tout.
  function confirmBtn(btn, fn) {
    if (armedBtn !== btn) {
      armedBtn = btn;
      btn.textContent = "Confirmer";
      setStatus("Appuie encore pour confirmer.", true);
      return;
    }
    armedBtn = null;
    fn();
  }
  el.del.addEventListener("click", function () {
    confirmBtn(el.del, function () {
      var master = masterOf(editingId);
      if (!master) return;
      var removed = JSON.parse(JSON.stringify(master));
      if (editingOcc) {
        master.skip = (master.skip || []).concat([editingOcc]);
        saveEvents();
        closeSheet();
        render(false);
        showUndo("Occurrence supprimée", function () { var cur = masterOf(removed.id); if (cur) cur.skip = removed.skip; saveEvents(); render(false); });
        return;
      }
      events = events.filter(function (x) { return x.id !== editingId; });
      saveEvents();
      buzz(20);
      closeSheet();
      render(false);
      showUndo("Événement supprimé", function () { events.push(removed); saveEvents(); render(false); });
    });
  });
  el.delSeries.addEventListener("click", function () {
    confirmBtn(el.delSeries, function () {
      var removed = masterOf(editingId);
      if (!removed) return;
      var copy = JSON.parse(JSON.stringify(removed));
      events = events.filter(function (x) { return x.id !== editingId; });
      saveEvents();
      buzz(20);
      closeSheet();
      render(false);
      showUndo("Série supprimée", function () { events.push(copy); saveEvents(); render(false); });
    });
  });
  el.dup.addEventListener("click", function () {
    var src = masterOf(editingId);
    if (!src) return;
    var copy = Object.assign({}, src, { id: uid(), uid: null, title: src.title + " (copie)", skip: [] });
    events.push(copy);
    saveEvents();
    closeSheet();
    state.cursor = parseKey(copy.date);
    render(false);
    showUndo("Événement dupliqué", function () { events = events.filter(function (x) { return x.id !== copy.id; }); saveEvents(); render(false); });
  });
  el.cancel.addEventListener("click", closeSheet);
  el.close.addEventListener("click", closeSheet);
  el.sheet.addEventListener("close", function () { armedBtn = null; pendingTaskId = null; });

  // Planifier une tâche à un créneau (minutes depuis minuit).
  function planTask(t, k, startMin) {
    state.cursor = parseKey(k);
    openSheet(k, null, startMin, t);
  }

  // ---------- Aperçu d'un jour ----------
  function openDrawer(k) {
    var d = parseKey(k);
    el.drawerTitle.textContent = cap(DAYS[d.getDay()]) + " " + d.getDate() + " " + MONTHS[d.getMonth()];
    el.drawerBody.innerHTML = "";
    var evs = eventsOn(k);
    var evBox = el_("div", "events");
    if (!evs.length) evBox.appendChild(el_("div", "empty", "Aucun événement ce jour."));
    evs.forEach(function (ev) {
      evBox.appendChild(evButton(ev));
      if (ev.notes) evBox.appendChild(richText(ev.notes));
      if (ev.checklist && ev.checklist.length) {
        var master = masterOf(ev.id);
        evBox.appendChild(checklist(master.checklist, function (arr) {
          master.checklist = arr;
          saveEvents();
          refresh();
          openDrawer(k);
        }, "Ajouter une étape"));
      }
    });
    el.drawerBody.appendChild(evBox);
    var tks = tasksOn(k);
    if (tks.length) {
      var tBox = el_("div", "task-list");
      tks.forEach(function (t) { tBox.appendChild(taskRow(t, { day: k })); });
      el.drawerBody.appendChild(tBox);
    }
    var actions = el_("div", "drawer-actions");
    var openDay = el_("button", "btn", "Ouvrir la journée");
    openDay.type = "button";
    openDay.addEventListener("click", function () { closeDialog(el.drawer); state.cursor = parseKey(k); state.view = "day"; render(true); });
    var addE = el_("button", "btn primary", "+ Événement");
    addE.type = "button";
    addE.addEventListener("click", function () { openSheet(k, null, null); });
    actions.appendChild(openDay);
    actions.appendChild(addE);
    el.drawerBody.appendChild(actions);
    openDialog(el.drawer);
  }
  el.drawerClose.addEventListener("click", function () { closeDialog(el.drawer); });

  // ---------- Recherche ----------
  var SCOPES = [{ value: "all", label: "Tout" }, { value: "today", label: "Aujourd'hui" }, { value: "week", label: "Semaine" }, { value: "month", label: "Mois" }];
  function inScope(k) {
    var today = keyOf(new Date());
    if (state.scope === "today") return k === today;
    if (state.scope === "week") {
      var m = keyOf(mondayOf(new Date())), s = keyOf(addDays(mondayOf(new Date()), 6));
      return k >= m && k <= s;
    }
    if (state.scope === "month") return k.slice(0, 7) === today.slice(0, 7);
    return true;
  }
  function runSearch(raw) {
    var q = raw.trim().toLowerCase();
    if (!q) return { events: [], tasks: [] };
    var evs = events.filter(function (e) {
      return inScope(e.date) && ((e.title || "").toLowerCase().indexOf(q) >= 0 || (e.place || "").toLowerCase().indexOf(q) >= 0 ||
        (e.notes || "").toLowerCase().indexOf(q) >= 0 || e.date.indexOf(q) >= 0 || (e.tz || "").toLowerCase().indexOf(q) >= 0);
    }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.start < b.start ? -1 : 1); });
    var tks = tasks.filter(function (t) {
      return inScope(t.date) && ((t.title || "").toLowerCase().indexOf(q) >= 0 || t.date.indexOf(q) >= 0 ||
        (t.notes || "").toLowerCase().indexOf(q) >= 0 || (t.subs || []).some(function (s) { return s.text.toLowerCase().indexOf(q) >= 0; }));
    }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return { events: evs, tasks: tks };
  }
  function renderScope() {
    optGroup(el.searchScope, SCOPES, { set value(v) { state.scope = v; }, get value() { return state.scope; } }, renderSearch);
    Array.prototype.forEach.call(el.searchScope.querySelectorAll("[data-val]"), function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-val") === state.scope ? "true" : "false");
    });
  }
  function renderSearch() {
    renderScope();
    var r = runSearch(el.searchInput.value);
    el.results.innerHTML = "";
    if (!el.searchInput.value.trim()) return;
    if (!r.events.length && !r.tasks.length) { el.results.appendChild(el_("p", "hint", "Aucun résultat.")); return; }
    function jump(k) { closeDialog(el.search); state.cursor = parseKey(k); state.view = "day"; render(true); }
    r.events.forEach(function (ev) {
      var b = el_("button", "result");
      b.type = "button";
      b.appendChild(el_("b", null, "● " + ev.title));
      b.appendChild(el_("small", null, ev.date + " · " + timeLabel(ev) + (ev.place ? " · " + ev.place : "") + repLabel(ev)));
      b.addEventListener("click", function () { jump(ev.date); });
      el.results.appendChild(b);
    });
    r.tasks.forEach(function (t) {
      var b = el_("button", "result");
      b.type = "button";
      b.appendChild(el_("b", null, (taskDone(t, t.date) ? "✓ " : "☐ ") + t.title));
      b.appendChild(el_("small", null, t.date + " · tâche" + (t.rule ? " · " + RULE_LABELS[t.rule] : "")));
      b.addEventListener("click", function () { jump(t.date); });
      el.results.appendChild(b);
    });
  }
  el.searchInput.addEventListener("input", renderSearch);
  el.searchBtn.addEventListener("click", function () {
    el.searchInput.value = "";
    el.results.innerHTML = "";
    renderScope();
    openDialog(el.search);
    el.searchInput.focus();
  });
  el.searchClose.addEventListener("click", function () { closeDialog(el.search); });

  // ---------- Export et import .ics ----------
  function icsEscape(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
  function icsKey(k) { return k.replace(/-/g, ""); }
  function icsDateTime(k, hhmm) { return icsKey(k) + "T" + hhmm.replace(":", "") + "00"; }
  function nextKey(k) { return keyOf(addDays(parseKey(k), 1)); }
  function stamp() { return new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z"; }
  var RRULES = { daily: "FREQ=DAILY", weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", weekly: "FREQ=WEEKLY", monthly: "FREQ=MONTHLY", yearly: "FREQ=YEARLY" };
  function buildIcs() {
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Calendrier Velours//FR", "CALSCALE:GREGORIAN"];
    events.forEach(function (e) {
      lines.push("BEGIN:VEVENT", "UID:" + e.id + "@calendrier", "DTSTAMP:" + stamp(), "SUMMARY:" + icsEscape(e.title));
      if (e.allDay) lines.push("DTSTART;VALUE=DATE:" + icsKey(e.date), "DTEND;VALUE=DATE:" + icsKey(nextKey(e.endDate || e.date)));
      else if (e.tz) lines.push("DTSTART;TZID=" + e.tz + ":" + icsDateTime(e.date, e.start), "DTEND;TZID=" + e.tz + ":" + icsDateTime(e.date, e.end));
      else lines.push("DTSTART:" + icsDateTime(e.date, e.start), "DTEND:" + icsDateTime(e.date, e.end));
      (e.reminds || []).forEach(function (r) {
        lines.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEscape(e.title), "TRIGGER:-PT" + r + "M", "END:VALARM");
      });
      if (e.rule) {
        var rr = e.rule === "every" ? (e.unit === "week" ? "FREQ=WEEKLY" : "FREQ=DAILY") + ";INTERVAL=" + (e.every || 1) : RRULES[e.rule];
        if (e.until) rr += ";UNTIL=" + icsKey(e.until);
        lines.push("RRULE:" + rr);
      }
      if (e.place) lines.push("LOCATION:" + icsEscape(e.place));
      if (e.notes) lines.push("DESCRIPTION:" + icsEscape(e.notes));
      lines.push("END:VEVENT");
    });
    tasks.forEach(function (t) {
      lines.push("BEGIN:VTODO", "UID:" + t.id + "@calendrier", "DTSTAMP:" + stamp(), "SUMMARY:" + icsEscape(t.title), "DUE;VALUE=DATE:" + icsKey(t.date));
      if (t.rule) lines.push("RRULE:" + RRULES[t.rule] + (t.until ? ";UNTIL=" + icsKey(t.until) : ""));
      lines.push("STATUS:" + (!t.rule && t.done ? "COMPLETED" : "NEEDS-ACTION"), "END:VTODO");
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }
  function unescapeIcs(s) { return s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1"); }
  function parseIcsDate(name, val) {
    var digits = val.replace(/[^0-9T]/g, "");
    var date = digits.slice(0, 4) + "-" + digits.slice(4, 6) + "-" + digits.slice(6, 8);
    if (name.indexOf("VALUE=DATE") >= 0 || digits.length < 15) return { date: date, time: null };
    var y = +digits.slice(0, 4), mo = +digits.slice(4, 6) - 1, d = +digits.slice(6, 8), h = +digits.slice(9, 11), mi = +digits.slice(11, 13);
    if (/Z$/.test(val)) { var dt = new Date(Date.UTC(y, mo, d, h, mi)); return { date: keyOf(dt), time: pad(dt.getHours()) + ":" + pad(dt.getMinutes()) }; }
    return { date: date, time: pad(h) + ":" + pad(mi) };
  }
  // Import : les événements déjà présents (même UID) ne sont pas recréés.
  function parseIcs(text) {
    var unfolded = text.replace(/\r?\n[ \t]/g, "");
    var blocks = { events: [], tasks: [] }, cur = null;
    unfolded.split(/\r?\n/).forEach(function (line) {
      if (!line) return;
      var idx = line.indexOf(":");
      if (idx < 0) return;
      var name = line.slice(0, idx), val = line.slice(idx + 1), base = name.split(";")[0].toUpperCase();
      if (base === "BEGIN" && (val === "VEVENT" || val === "VTODO")) { cur = { kind: val, raw: {} }; return; }
      if (base === "END" && cur) { (cur.kind === "VEVENT" ? blocks.events : blocks.tasks).push(cur.raw); cur = null; return; }
      if (cur) cur.raw[base] = { name: name, val: unescapeIcs(val) };
    });
    var known = {};
    events.forEach(function (e) { if (e.uid) known[e.uid] = true; });
    var imported = { events: 0, tasks: 0, skipped: 0 };
    blocks.events.forEach(function (r) {
      if (!r.DTSTART || !r.SUMMARY) return;
      var uidVal = r.UID ? r.UID.val : null;
      if (uidVal && known[uidVal]) { imported.skipped++; return; }
      if (uidVal) known[uidVal] = true;
      var s = parseIcsDate(r.DTSTART.name, r.DTSTART.val), allDay = !s.time;
      var e = r.DTEND ? parseIcsDate(r.DTEND.name, r.DTEND.val) : null;
      var start = allDay ? "00:00" : s.time;
      var end = allDay ? "23:59" : (e && e.time && e.date === s.date ? e.time : fromMin(toMin(start) + 60));
      if (!allDay && end <= start) end = fromMin(toMin(start) + 60);
      var endDate = null;
      if (allDay && e && e.date > s.date) { var last = keyOf(addDays(parseKey(e.date), -1)); if (last > s.date) endDate = last; }
      var rule = null, until = null;
      if (r.RRULE && !endDate) {
        var rv = r.RRULE.val;
        if (/FREQ=DAILY/.test(rv)) rule = "daily";
        else if (/FREQ=WEEKLY/.test(rv) && /BYDAY=MO,TU,WE,TH,FR/.test(rv)) rule = "weekdays";
        else if (/FREQ=WEEKLY/.test(rv)) rule = "weekly";
        else if (/FREQ=MONTHLY/.test(rv)) rule = "monthly";
        else if (/FREQ=YEARLY/.test(rv)) rule = "yearly";
        var untilM = /UNTIL=(\d{8})/.exec(rv);
        if (untilM) until = untilM[1].slice(0, 4) + "-" + untilM[1].slice(4, 6) + "-" + untilM[1].slice(6, 8);
      }
      events.push(normalize({
        id: uid(), uid: uidVal, title: r.SUMMARY.val, date: s.date, start: start, end: end, allDay: allDay, endDate: endDate,
        place: r.LOCATION ? r.LOCATION.val : "", notes: r.DESCRIPTION ? r.DESCRIPTION.val : "", color: COLORS[2], rule: rule, until: until
      }));
      imported.events++;
    });
    blocks.tasks.forEach(function (r) {
      if (!r.SUMMARY) return;
      var due = r.DUE ? parseIcsDate(r.DUE.name, r.DUE.val) : (r.DTSTART ? parseIcsDate(r.DTSTART.name, r.DTSTART.val) : null);
      if (!due) return;
      tasks.push(normalizeTask({ title: r.SUMMARY.val, date: due.date, done: !!(r.STATUS && r.STATUS.val.toUpperCase() === "COMPLETED"), created: Date.now() }));
      imported.tasks++;
    });
    return imported;
  }

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
  el.exportBtn.addEventListener("click", function () {
    el.icsText.value = buildIcs();
    el.copyStatus.textContent = "";
    closeDialog(el.menu);
    openDialog(el.exportDlg);
    el.icsText.focus();
    el.icsText.select();
  });
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

  var swipe = { x: null, y: null };
  el.view.addEventListener("touchstart", function (e) {
    if (e.target.closest && e.target.closest(".evb, .task, .tl-wrap, .twrap, textarea, input")) { swipe.x = null; return; }
    swipe.x = e.touches[0].clientX; swipe.y = e.touches[0].clientY;
  }, { passive: true });
  el.view.addEventListener("touchend", function (e) {
    if (swipe.x == null) return;
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
    var b = el_("button", "opt", d >= 60 ? (d / 60) + " h" + (d % 60 ? " " + (d % 60) : "") : d + " min");
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
    document.getElementById("work-btn").textContent = "Heures ouvrées grisées : " + (settings.workShade ? "oui" : "non");
    var box = document.getElementById("dur-set");
    box.innerHTML = "";
    [15, 30, 60].forEach(function (d) {
      var b = el_("button", "opt", d === 60 ? "1 h" : d + " min");
      b.type = "button";
      b.setAttribute("aria-pressed", settings.dur === d ? "true" : "false");
      b.addEventListener("click", function () { settings.dur = d; saveSettings(); renderSettingsBtns(); });
      box.appendChild(b);
    });
  }
  document.getElementById("ws-btn").addEventListener("click", function () { settings.weekStart = settings.weekStart === 1 ? 0 : 1; saveSettings(); renderSettingsBtns(); refresh(); });
  document.getElementById("span-btn").addEventListener("click", function () { settings.span = settings.span === 3 ? 7 : 3; saveSettings(); renderSettingsBtns(); refresh(); });
  document.getElementById("work-btn").addEventListener("click", function () { settings.workShade = !settings.workShade; saveSettings(); renderSettingsBtns(); refresh(); });
  renderSettingsBtns();

  document.getElementById("goto-btn").addEventListener("click", function () {
    closeDialog(el.menu);
    pickDate(null, false, function (k) { state.cursor = parseKey(k); render(true); }, "Aller à une date");
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
          showUndo("Aujourd'hui à " + toMin(ev.start) / 60 + " : " + ev.title, null);
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
      var msg = "Dans " + (st - nowMin) + " min : " + ev.title + (ev.place ? " · " + ev.place : "");
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
    else if (e.key === "/") { e.preventDefault(); el.searchBtn.click(); }
  });

  document.getElementById("btn-start").addEventListener("click", function () { pickTime(el.fStart); });
  document.getElementById("btn-remindat").addEventListener("click", function () {
    pickTime(document.getElementById("f-remindat"));
  });
  document.getElementById("btn-end").addEventListener("click", function () { pickTime(el.fEnd); });
  document.getElementById("btn-date").addEventListener("click", function () { pickDate(el.fDate, false); });
  document.getElementById("btn-enddate").addEventListener("click", function () { pickDate(el.fEndDate, true); });
  document.getElementById("btn-until").addEventListener("click", function () { pickDate(el.fUntil, true); });
  refreshDisplays();

  render(false);
  if (rolledOver) showUndo(rolledOver + " tâche(s) non faite(s) reportée(s) à aujourd'hui", null);
})();
