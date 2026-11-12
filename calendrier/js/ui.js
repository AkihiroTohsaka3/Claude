/* Composants : saisie rapide, texte enrichi, listes à cocher, Pomodoro, en-tête, filtres, lignes de tâche. */
"use strict";

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
      if (cut(new RegExp("\\b(?:(?:le|ce)\\s+)?" + DAYS[i] + "(?:\\s+prochain)?\\b", "i"))) {
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
  } else if (cut(/(?:^|\s)à\s+(\d{1,2})\b/i)) {
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
    eyebrow = "Semaine " + weekNumber(addDays(m, settings.span !== 3 && settings.weekStart === 0 ? 1 : 0));
    // « 9 – 15 nov. » ; le mois de début n'est répété que s'il change, l'année seulement si ce n'est pas l'année en cours.
    label = m.getDate() + (m.getMonth() !== s.getMonth() ? " " + MONTHS_SHORT[m.getMonth()] : "") + " – " + s.getDate() + " " + MONTHS_SHORT[s.getMonth()] +
      (s.getFullYear() !== new Date().getFullYear() || m.getFullYear() !== s.getFullYear() ? " " + s.getFullYear() : "");
  } else if (state.view === "year") { eyebrow = "Vue annuelle"; label = String(c.getFullYear()); }
  else if (state.view === "agenda") { eyebrow = "Planning"; label = (keyOf(c) === keyOf(new Date()) ? "Dès aujourd'hui" : "Dès le " + c.getDate() + " " + MONTHS_SHORT[c.getMonth()]); }
  else { eyebrow = "Jour"; label = cap(DAYS[c.getDay()]) + " " + c.getDate() + " " + MONTHS[c.getMonth()]; }
  el.eyebrow.textContent = eyebrow;
  var tn = document.getElementById("today-num");
  if (tn) tn.textContent = String(new Date().getDate());
  el.period.textContent = label;
  Array.prototype.forEach.call(el.tabs, function (t) {
    t.setAttribute("aria-selected", t.getAttribute("data-view") === state.view ? "true" : "false");
  });
}
function renderFilters() {
  [el.filters, byId("side-filters")].forEach(function (box) {
    if (!box) return;
    box.innerHTML = "";
    var all = el_("button", "fchip", "Toutes");
    all.type = "button";
    all.setAttribute("aria-pressed", state.cat == null ? "true" : "false");
    all.addEventListener("click", function () { state.cat = null; refresh(); });
    box.appendChild(all);
    COLORS.forEach(function (c, i) {
      var b = el_("button", "fchip");
      b.type = "button";
      var dot = el_("i");
      dot.style.background = c;
      b.appendChild(dot);
      b.setAttribute("aria-label", "N'afficher que la catégorie " + (i + 1));
      b.setAttribute("aria-pressed", state.cat === i ? "true" : "false");
      b.addEventListener("click", function () { state.cat = state.cat === i ? null : i; refresh(); });
      box.appendChild(b);
    });
    var open = el_("button", "fchip", "En attente");
    open.type = "button";
    open.setAttribute("aria-label", "N'afficher que les tâches en attente");
    open.setAttribute("aria-pressed", state.openOnly ? "true" : "false");
    open.addEventListener("click", function () { state.openOnly = !state.openOnly; refresh(); });
    box.appendChild(open);
  });
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
  var row = el_("div", "task" + (done ? " done" : "") + (t.star ? " starred" : "") + (opts.plan ? " plan" : ""));
  var acts = opts.plan ? el_("div", "task-acts") : null;
  var check = el_("button", "check");
  check.type = "button";
  check.setAttribute("aria-pressed", done ? "true" : "false");
  check.setAttribute("aria-label", (done ? "Remettre à faire : " : "Marquer comme faite : ") + t.title);
  check.addEventListener("click", function (e) { e.stopPropagation(); toggleTask(t.id, k); });
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
    var pom = el_("button", "tbtn", "⏱ Pomodoro");
    pom.type = "button";
    pom.setAttribute("aria-label", "Lancer un Pomodoro sur « " + t.title + " »");
    pom.addEventListener("click", function (e) { e.stopPropagation(); pomoStart(t, k); });
    acts.appendChild(pom);
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
      acts.appendChild(next);
    }
    var plan = el_("button", "tbtn", "Planifier");
    plan.type = "button";
    plan.setAttribute("aria-label", "Planifier « " + t.title + " » dans la timeline");
    plan.addEventListener("click", function (e) { e.stopPropagation(); planTask(t, k, settings.workStart * 60); });
    acts.appendChild(plan);
  }
  var star = el_("button", "star");
  star.type = "button";
  star.appendChild(svgIcon("M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.2-4.1 5.8-.8z"));
  star.setAttribute("aria-pressed", t.star ? "true" : "false");
  star.setAttribute("aria-label", (t.star ? "Ne plus marquer comme importante : " : "Marquer comme importante : ") + t.title);
  star.addEventListener("click", function (e) {
    e.stopPropagation();
    var cur = taskById(t.id);
    if (!cur) return;
    cur.star = !cur.star;
    saveTasks();
    refresh();
  });
  row.appendChild(star);
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
  if (acts) row.appendChild(acts);
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
