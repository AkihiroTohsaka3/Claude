/* Vues : Mois, Semaine, Jour, Planning, Année, et le rendu général. */
"use strict";

function clampIdx(key, rowStart) {
  var diff = Math.round((parseKey(key) - rowStart) / 86400000);
  return Math.max(0, Math.min(6, diff));
}
// Barres des événements sur plusieurs jours, posées sur la ligne de la semaine.
// Renvoie la boîte, le nombre de rangées occupées et les événements affichés.
function monthBars(rowStart) {
  var box = el_("div", "mbars");
  var rowKey = keyOf(rowStart), rowEnd = keyOf(addDays(rowStart, 6));
  box.setAttribute("data-row", rowKey);
  var spans = events.filter(function (e) {
    return e.allDay && e.endDate && e.endDate > e.date && e.endDate >= rowKey && e.date <= rowEnd &&
      !state.hidden[catIndex(e)] && (state.cat == null || catIndex(e) === state.cat);
  }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  var laneEnd = [], shown = {};
  spans.forEach(function (ev) {
    var s = clampIdx(ev.date < rowKey ? rowKey : ev.date, rowStart);
    var en = clampIdx(ev.endDate > rowEnd ? rowEnd : ev.endDate, rowStart);
    var lane = -1;
    for (var i = 0; i < laneEnd.length; i++) if (laneEnd[i] < s) { lane = i; break; }
    if (lane < 0) { if (laneEnd.length >= 2) return; lane = laneEnd.length; }
    laneEnd[lane] = en;
    shown[ev.id] = true;
    var bar = el_("button", "mbar" + (ev.date < rowKey ? " cont-l" : "") + (ev.endDate > rowEnd ? " cont-r" : ""), ev.title);
    bar.type = "button";
    bar.style.gridColumn = (s + 1) + " / " + (en + 2);
    bar.style.gridRow = String(lane + 1);
    bar.style.background = colorOf(ev);
    bar.setAttribute("data-id", ev.id);
    bar.setAttribute("aria-label", ev.title + ", " + rangeLabel(ev.date, ev.endDate).toLowerCase());
    // Au doigt, la barre laisse passer l'appui : toute la case ouvre le jour. À la souris, elle ouvre l'événement.
    if (isDesk() && mqFine.matches) {
      bindMonthCell(bar, ev.date);
      bar.addEventListener("click", function (e) { e.stopPropagation(); if (suppressClick) return; openSheet(ev.date, masterOf(ev.id), null); });
    } else { bar.style.pointerEvents = "none"; bar.tabIndex = -1; }
    box.appendChild(bar);
  });
  return { box: box, lanes: laneEnd.length, shown: shown };
}
function renderMonth() {
  var c = state.cursor, first = new Date(c.getFullYear(), c.getMonth(), 1);
  var start = mondayOf(first), todayK = keyOf(new Date()), selK = keyOf(c);
  var weeks = Math.ceil((dowIdx(first) + new Date(c.getFullYear(), c.getMonth() + 1, 0).getDate()) / 7);
  var wide = window.innerWidth >= 720, mouse = isDesk() && mqFine.matches;
  var dow = el_("div", "dow");
  weekLabels().forEach(function (n) { dow.appendChild(el_("div", null, n)); });
  el.view.appendChild(dow);
  var grid = el_("div", "month-wrap");
  // Nombre de lignes de texte qui tiennent dans une case, selon la hauteur de l'écran.
  var rowH = Math.max(wide ? 96 : 64, (el.view.clientHeight - 34) / weeks);
  for (var w = 0; w < weeks; w++) {
    var rowStart = addDays(start, w * 7);
    var row = el_("div", "mrow");
    var bars = monthBars(rowStart);
    row.style.setProperty("--lanes", String(bars.lanes));
    var room = Math.floor((rowH - (wide ? 42 : 34) - bars.lanes * (wide ? 22 : 18)) / (wide ? 23 : 17));
    for (var i = 0; i < 7; i++) row.appendChild(monthCell(addDays(rowStart, i), c, todayK, selK, bars.shown, room, mouse));
    row.appendChild(bars.box);
    grid.appendChild(row);
  }
  el.view.appendChild(grid);
}
function monthCell(d, c, todayK, selK, inBars, room, mouse) {
  var k = keyOf(d);
  var list = eventsOn(k).filter(function (ev) { return !inBars[ev.id]; });
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
    (list.length ? ", " + plural(list.length, "événement", "événements") : "") + (open.length ? ", " + plural(open.length, "tâche restante", "tâches restantes") : ""));
  cell.appendChild(el_("span", "n", String(d.getDate())));
  var chips = el_("span", "chips-wrap");
  // Dernière ligne commune : « +2 » (événements non affichés) et le nombre de tâches restantes.
  var lines = Math.max(1, room), foot = open.length > 0;
  if (list.length > lines - (foot ? 1 : 0)) foot = true;
  var showN = Math.min(list.length, Math.max(0, lines - (foot ? 1 : 0)));
  list.slice(0, showN).forEach(function (ev) {
    var chip = el_("span", "chip");
    if (!ev.allDay) chip.appendChild(el_("span", "t", ev.start));
    chip.appendChild(document.createTextNode(ev.title));
    chip.setAttribute("data-id", ev.id);
    chip.style.background = colorOf(ev);
    chips.appendChild(chip);
  });
  if (foot) {
    var f = el_("span", "cell-foot");
    if (list.length > showN) f.appendChild(el_("span", "more", "+" + (list.length - showN)));
    if (open.length) f.appendChild(el_("span", "tchip", "☐ " + open.length));
    chips.appendChild(f);
  }
  cell.appendChild(chips);
  cell.addEventListener("click", function (e) {
    if (suppressClick) return;
    state.cursor = d;
    var chip = e.target.closest ? e.target.closest(".chip") : null;
    if (mouse && chip) { renderHeader(); markSelection(); openSheet(k, masterOf(chip.getAttribute("data-id")), null); return; }
    if (mouse && e.target.closest && e.target.closest(".n")) { state.view = "day"; render(true); return; }
    renderHeader(); markSelection(); renderSide();
    // À la souris : le vide d'une case crée un événement, la ligne « +2 · tâches » ouvre l'aperçu du jour.
    // Au doigt : toute la case ouvre l'aperçu du jour.
    if (mouse && !(e.target.closest && e.target.closest(".cell-foot"))) openSheet(k, null, null);
    else openDrawer(k);
  });
  return cell;
}
function markSelection() {
  var selK = keyOf(state.cursor);
  Array.prototype.forEach.call(el.view.querySelectorAll("[data-key]"), function (n) { n.classList.toggle("sel", n.getAttribute("data-key") === selK); });
}

// ---------- Vue Semaine ----------
function weekDates() {
  var n = settings.span === 3 ? 3 : 7, startD = settings.span === 3 ? state.cursor : mondayOf(state.cursor), out = [];
  for (var i = 0; i < n; i++) out.push(addDays(startD, i));
  return out;
}
// Grille horaire sur ordinateur et en vue 3 jours ; liste par jour sur téléphone en vue 7 jours.
function weekUsesGrid() { return settings.span === 3 || isDesk(); }
function weekStats(keys) {
  var st = { byColor: {}, done: 0, total: 0 };
  keys.forEach(function (k) {
    eventsOn(k).forEach(function (ev) {
      if (ev.allDay) return;
      var key = colorOf(ev);
      st.byColor[key] = st.byColor[key] || { m: 0, c: key };
      st.byColor[key].m += Math.max(0, endMin(ev) - toMin(ev.start));
    });
    allTasksOn(k).forEach(function (t) { st.total++; if (taskDone(t, k)) st.done++; });
  });
  return st;
}
function renderWeek() {
  var dates = weekDates(), keys = dates.map(keyOf);
  if (weekUsesGrid()) renderWeekGrid(dates, keys);
  else renderWeekList(dates, keys);
}
function renderWeekList(dates, keys) {
  var todayK = keyOf(new Date()), selK = keyOf(state.cursor);
  var week = el_("div", "week");
  dates.forEach(function (d, i) {
    var k = keys[i];
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
      if (!isFixed(ev)) bindEventMove(eb, ev.id, k);
    });
    if (tks.length) {
      var tl = el_("div", "wtasks");
      tks.forEach(function (t) { tl.appendChild(taskRow(t, { day: k, drag: true })); });
      col.appendChild(tl);
    }
    col.addEventListener("click", function (e) {
      if (suppressClick) return;
      if (e.target.closest && e.target.closest(".ev, .check, .x, .ttl, .tbtn, .star, .sub, .twrap, textarea, input")) return;
      if (keyOf(state.cursor) === k) { state.view = "day"; render(true); return; }
      state.cursor = d; renderHeader(); markSelection();
    });
    bindWeekRange(col, k);
    week.appendChild(col);
  });
  el.view.appendChild(week);
  var st = weekStats(keys);
  el.view.appendChild(renderStats(st.byColor, st.done, st.total, keys));
}
function renderWeekGrid(dates, keys) {
  var n = keys.length, todayK = keyOf(new Date());
  var head = el_("div", "wk-head");
  head.style.setProperty("--cols", String(n));
  head.appendChild(el_("span"));
  dates.forEach(function (d, i) {
    var h = el_("button", "wk-col-h" + (keys[i] === todayK ? " today" : ""));
    h.type = "button";
    h.setAttribute("data-key", keys[i]);
    h.setAttribute("aria-label", "Ouvrir " + DAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()]);
    h.appendChild(el_("span", null, DAYS_SHORT[(d.getDay() + 6) % 7]));
    h.appendChild(el_("b", null, String(d.getDate())));
    h.addEventListener("click", function () { state.cursor = d; state.view = "day"; render(true); });
    head.appendChild(h);
  });
  el.view.appendChild(head);

  // Rangée du haut : événements de journée (étirés sur leurs jours) et tâches.
  var all = el_("div", "wk-all");
  all.style.setProperty("--cols", String(n));
  all.appendChild(el_("span", "gut", "Jour"));
  var seen = {}, count = 0;
  keys.forEach(function (k, i) {
    eventsOn(k).forEach(function (ev) {
      if (!ev.allDay) return;
      var multi = ev.endDate && ev.endDate > ev.date;
      if (multi && seen[ev.id]) return;
      seen[ev.id] = true;
      var node = evButton(ev), from = i, to = i;
      if (multi) { to = ev.endDate > keys[n - 1] ? n - 1 : Math.max(i, keys.indexOf(ev.endDate)); }
      node.style.gridColumn = (from + 2) + " / " + (to + 3);
      if (!isFixed(ev)) bindEventMove(node, ev.id, k);
      all.appendChild(node);
      count++;
    });
  });
  keys.forEach(function (k, i) {
    tasksOn(k).forEach(function (t) {
      var done = taskDone(t, k);
      var b = el_("button", "wk-task" + (done ? " done" : ""));
      b.type = "button";
      b.style.gridColumn = String(i + 2);
      b.appendChild(el_("span", null, t.title));
      b.setAttribute("aria-pressed", done ? "true" : "false");
      b.setAttribute("aria-label", (done ? "Remettre à faire : " : "Marquer comme faite : ") + t.title);
      b.addEventListener("click", function () { toggleTask(t.id, k); });
      all.appendChild(b);
      count++;
    });
  });
  if (count) el.view.appendChild(all);
  appendTimeline(keys);

  var st = weekStats(keys), pct = st.total ? Math.round(st.done / st.total * 100) : 0;
  var fold = el_("details", "stats-fold");
  fold.open = statsOpen;
  fold.addEventListener("toggle", function () { statsOpen = fold.open; });
  var sum = el_("summary", null, "Bilan de la semaine");
  sum.appendChild(el_("span", null, st.total ? pct + " % des tâches faites" : "Aucune tâche"));
  fold.appendChild(sum);
  fold.appendChild(renderStats(st.byColor, st.done, st.total, keys));
  el.view.appendChild(fold);
}
var statsOpen = false;
function toggleTask(id, k) {
  var cur = taskById(id);
  if (!cur) return;
  if (cur.rule) {
    var idx = cur.doneDates.indexOf(k);
    if (idx >= 0) cur.doneDates.splice(idx, 1); else cur.doneDates.push(k);
  } else cur.done = !cur.done;
  saveTasks();
  buzz(12);
  refresh();
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
  box.appendChild(el_("p", "hint", total ? done + " sur " + plural(total, "tâche faite", "tâches faites") + " cette semaine." : "Aucune tâche cette semaine."));
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
  for (var i = 0; i < 366; i++, d = addDays(d, -1)) {
    var k = keyOf(d), list = allTasksOn(k);
    if (!list.length) continue;
    if (list.every(function (t) { return taskDone(t, k); })) n++;
    else if (i > 0) break;
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
  var c = state.cursor, k = keyOf(c), todayK = keyOf(new Date());
  var isToday = k === todayK;
  var list = eventsOn(k);
  var allDay = list.filter(function (e) { return e.allDay; });
  var timed = list.filter(function (e) { return !e.allDay; });

  // Bandeau des sept jours : changer de jour d'un seul appui.
  var strip = el_("div", "wstrip");
  var m = mondayOf(c), labels = weekLabels();
  for (var i = 0; i < 7; i++) {
    (function (d, label) {
      var kk = keyOf(d);
      var b = el_("button", "ws-day" + (kk === todayK ? " today" : "") + (kk === k ? " sel" : ""));
      b.type = "button";
      b.setAttribute("data-key", kk);
      b.setAttribute("aria-label", cap(DAYS[d.getDay()]) + " " + d.getDate() + " " + MONTHS[d.getMonth()]);
      if (kk === k) b.setAttribute("aria-current", "date");
      if (rawEventsOn(kk).length || allTasksOn(kk).some(function (t) { return !taskDone(t, kk); })) b.classList.add("has");
      b.appendChild(el_("span", null, label));
      b.appendChild(el_("b", null, String(d.getDate())));
      b.addEventListener("click", function () { state.cursor = d; refresh(); });
      strip.appendChild(b);
    })(addDays(m, i), labels[i]);
  }
  el.view.appendChild(strip);

  var top = el_("div", "day-top");
  if (isToday) {
    var now0 = new Date(), nowMin0 = now0.getHours() * 60 + now0.getMinutes();
    var current = timed.filter(function (e) { return toMin(e.start) <= nowMin0 && endMin(e) > nowMin0; })[0];
    var next = timed.filter(function (e) { return toMin(e.start) > nowMin0; })[0];
    var txt = current ? "En cours : " + current.title + " jusqu'à " + current.end
      : next ? "Prochain : " + next.title + " dans " + fmtDur(toMin(next.start) - nowMin0)
      : "Plus d'événement aujourd'hui";
    var banner = el_("div", "banner");
    banner.appendChild(el_("span", null, txt));
    if (next || current) banner.appendChild(el_("b", null, (current || next).start));
    top.appendChild(banner);
  }
  top.appendChild(renderTasks(k));
  if (allDay.length) {
    var ad = el_("div", "allday");
    allDay.forEach(function (ev) { ad.appendChild(evButton(ev)); });
    top.appendChild(ad);
  }
  el.view.appendChild(top);
  appendTimeline([k]);
}

// Grille horaire pour un ou plusieurs jours (colonnes côte à côte).
function appendTimeline(keys) {
  var P = ppm(), todayK = keyOf(new Date());
  var wrap = el_("div", "tl-wrap");
  wrap.addEventListener("scroll", function () { scrollMemo = wrap.scrollTop; }, { passive: true });
  var tl = el_("div", "tl");
  tl.style.setProperty("--cols", String(keys.length));
  var hours = el_("div", "hours");
  for (var h = 1; h < 24; h++) {
    var lbl = el_("span", null, pad(h) + ":00");
    lbl.style.top = (h * 60 * P) + "px";
    hours.appendChild(lbl);
  }
  tl.appendChild(hours);
  keys.forEach(function (k) { tl.appendChild(dayColumn(k)); });
  wrap.appendChild(tl);
  el.view.appendChild(wrap);

  if (keepScroll && scrollMemo != null) { wrap.scrollTop = scrollMemo; return; }
  var now = new Date(), hasToday = keys.indexOf(todayK) >= 0;
  var target = Math.max(0, (hasToday ? now.getHours() * 60 + now.getMinutes() - 120 : settings.workStart * 60 - 45) * P);
  scrollMemo = target;
  wrap.scrollTop = target;
}

function dayColumn(k) {
  var P = ppm(), isToday = k === keyOf(new Date());
  var slots = el_("div", "slots" + (isToday ? " today" : ""));
  slots.setAttribute("data-day", k);
  for (var s = 0; s < 24; s++) {
    var slot = el_("button", "slot");
    slot.type = "button";
    slot.style.top = (s * 60 * P) + "px";
    slot.setAttribute("aria-label", "Créer un événement le " + shortDay(k) + " à " + pad(s) + ":00");
    slot.addEventListener("click", (function (hour) { return function () { if (suppressClick) return; openSheet(k, null, hour * 60); }; })(s));
    slots.appendChild(slot);
  }
  if (settings.workShade) {
    var off1 = el_("div", "off"); off1.style.top = "0px"; off1.style.height = (settings.workStart * 60 * P) + "px";
    var off2 = el_("div", "off"); off2.style.top = (settings.workEnd * 60 * P) + "px"; off2.style.height = ((24 - settings.workEnd) * 60 * P) + "px";
    slots.appendChild(off1);
    slots.appendChild(off2);
  }
  bindSlotCreate(slots, k);

  // Les événements qui se chevauchent se partagent la largeur ; les autres la prennent en entier.
  var groups = [], cur = null;
  eventsOn(k).forEach(function (ev) {
    if (ev.allDay) return;
    var st = toMin(ev.start), en = Math.max(endMin(ev), Math.min(1440, st + 30));
    var from = Math.max(0, st - ev.bBefore), to = Math.min(1440, en + ev.bAfter);
    if (!cur || from >= cur.end) { cur = { items: [], laneEnds: [], end: 0 }; groups.push(cur); }
    var lane = -1;
    for (var i = 0; i < cur.laneEnds.length; i++) { if (cur.laneEnds[i] <= from) { lane = i; break; } }
    if (lane < 0) lane = cur.laneEnds.length;
    cur.laneEnds[lane] = to;
    cur.end = Math.max(cur.end, to);
    cur.items.push({ ev: ev, st: st, en: en, from: from, to: to, lane: lane });
  });
  groups.forEach(function (g) {
    var total = g.laneEnds.length;
    g.items.forEach(function (p) {
      var b = el_("button", "evb");
      b.type = "button";
      b.style.background = colorOf(p.ev);
      b.style.top = (p.from * P) + "px";
      b.style.height = ((p.to - p.from) * P) + "px";
      b.style.left = "calc(" + (p.lane * 100 / total) + "% + 2px)";
      b.style.width = "calc(" + (100 / total) + "% - 4px)";
      b.setAttribute("aria-label", p.ev.title + ", " + timeLabel(p.ev));
      if (p.ev.bBefore) {
        var bb = el_("span", "buf", "Trajet " + p.ev.bBefore + " min");
        bb.style.height = ((p.st - p.from) * P) + "px";
        b.appendChild(bb);
      }
      var main = el_("span", "main");
      main.appendChild(el_("b", null, p.ev.title));
      main.appendChild(el_("small", null, (p.ev.lock ? "🔒 " : "") + timeLabel(p.ev) + (p.ev.place ? " · " + p.ev.place : "")));
      b.appendChild(main);
      if (p.ev.bAfter) {
        var ba = el_("span", "buf", "Retour " + p.ev.bAfter + " min");
        ba.style.height = ((p.to - p.en) * P) + "px";
        b.appendChild(ba);
      }
      var grip = el_("span", "grip");
      grip.setAttribute("aria-hidden", "true");
      b.appendChild(grip);
      if (isFixed(p.ev)) grip.hidden = true; else bindEventDrag(b, p, k);
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        if (suppressClick) return;
        openSheet(p.ev.occDate || p.ev.date, masterOf(p.ev.id), null);
      });
      slots.appendChild(b);
    });
  });

  if (isToday) {
    var now = new Date();
    var line = el_("div", "now");
    line.style.top = ((now.getHours() * 60 + now.getMinutes()) * P) + "px";
    line.appendChild(el_("span", "now-label", pad(now.getHours()) + ":" + pad(now.getMinutes())));
    slots.appendChild(line);
  }
  return slots;
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
  showUndo(plural(n, "élément copié", "éléments copiés") + " vers le " + parseKey(to).getDate() + " " + MONTHS[parseKey(to).getMonth()], null);
}

// ---------- Rendu ----------
function render(animate) {
  el.view.innerHTML = "";
  var grid = state.view === "week" && weekUsesGrid();
  el.view.className = "panel v-" + (grid ? "grid" : state.view);
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
  renderSide();
}
function refresh() { keepScroll = true; render(false); }

function step(dir) {
  var c = state.cursor;
  if (state.view === "month") state.cursor = addMonthsClamped(c, dir);
  else if (state.view === "week") state.cursor = addDays(c, (settings.span === 3 ? 3 : 7) * dir);
  else if (state.view === "year") state.cursor = new Date(c.getFullYear() + dir, c.getMonth(), Math.min(c.getDate(), 28));
  else if (state.view === "agenda") state.cursor = addDays(c, 30 * dir);
  else state.cursor = addDays(c, dir);
  render(true);
}

// ---------- Vue Planning (liste de 60 jours à partir du jour affiché) ----------
function renderAgenda() {
  var start = state.cursor, todayK = keyOf(new Date());
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
      var b = el_("button", "ag-task", "☐ " + t.title + (t.rule ? " · ↻ " + RULE_LABELS[t.rule] : ""));
      b.type = "button";
      b.addEventListener("click", (function (dt) { return function () { state.cursor = dt; state.view = "day"; render(true); }; })(d));
      day.appendChild(b);
    });
    box.appendChild(day);
  }
  if (!any) box.appendChild(el_("div", "empty-state", "Rien de prévu sur ces 60 jours."));
  el.view.appendChild(box);
}

// ---------- Vue Année ----------
function renderYear() {
  var y = state.cursor.getFullYear(), todayK = keyOf(new Date()), selK = keyOf(state.cursor);
  var now = new Date();
  var box = el_("div", "year");
  function heat(n) { return n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : 4; }
  var SHADES = [0, 28, 50, 75, 100];
  for (var mo = 0; mo < 12; mo++) {
    var first = new Date(y, mo, 1), days = new Date(y, mo + 1, 0).getDate();
    var sec = el_("section", "ym");
    var h = el_("button", "ym-h" + (y === now.getFullYear() && mo === now.getMonth() ? " cur" : ""), cap(MONTHS[mo]));
    h.type = "button";
    h.setAttribute("aria-label", "Ouvrir " + MONTHS[mo] + " " + y);
    h.addEventListener("click", (function (dt) { return function () { state.cursor = dt; state.view = "month"; render(true); }; })(first));
    sec.appendChild(h);
    var g = el_("div", "ym-grid");
    weekLabels().forEach(function (n) { g.appendChild(el_("span", "dn", n.charAt(0))); });
    for (var pre = 0; pre < dowIdx(first); pre++) { var e0 = el_("span", "yd empty"); e0.setAttribute("aria-hidden", "true"); g.appendChild(e0); }
    for (var dd = 1; dd <= days; dd++) {
      var d = new Date(y, mo, dd), k = keyOf(d);
      var count = eventsOn(k).length + allTasksOn(k).length;
      var lv = heat(count);
      var cell = el_("button", "yd l" + lv, String(dd));
      cell.type = "button";
      if (lv) cell.style.background = "color-mix(in srgb, var(--accent) " + SHADES[lv] + "%, transparent)";
      if (k === todayK) cell.classList.add("today");
      if (k === selK) cell.classList.add("sel");
      cell.setAttribute("aria-label", dd + " " + MONTHS[mo] + " : " + (count ? plural(count, "élément", "éléments") : "rien de prévu"));
      cell.addEventListener("click", (function (dt) { return function () { state.cursor = dt; state.view = "day"; render(true); }; })(d));
      g.appendChild(cell);
    }
    sec.appendChild(g);
    box.appendChild(sec);
  }
  el.view.appendChild(box);
  var legend = el_("div", "year-legend");
  legend.appendChild(el_("span", null, "Moins"));
  SHADES.forEach(function (l) {
    var sw = el_("i");
    sw.style.background = l ? "color-mix(in srgb, var(--accent) " + l + "%, transparent)" : "var(--surface-2)";
    legend.appendChild(sw);
  });
  legend.appendChild(el_("span", null, "Plus d'événements et de tâches"));
  el.view.appendChild(legend);
}
