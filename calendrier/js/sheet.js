/* Fiche d'événement, sélecteurs d'heure et de date, aperçu d'un jour, recherche. */
"use strict";

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
  byId("date-label").textContent = el.fRule.value ? "Premier jour de la série" : "Date";
  refreshDisplays();
  showConflict();
}
// Événements à heure fixe qui chevauchent [s, e[ un jour donné.
function overlaps(k, s, e, ignoreId) {
  return rawEventsOn(k).filter(function (ev) { return !ev.allDay && ev.id !== ignoreId && toMin(ev.start) < e && endMin(ev) > s; });
}
function showConflict() {
  var box = byId("conflict"), s = el.fStart.value, e = el.fEnd.value, k = el.fDate.value;
  var list = !el.fAllDay.checked && s && e && k && toMin(e) > toMin(s) ? overlaps(editingOcc || k, toMin(s), toMin(e), editingId) : [];
  box.hidden = !list.length;
  if (list.length) {
    box.textContent = "Chevauche " + list[0].title + " (" + list[0].start + "–" + list[0].end + ")" +
      (list.length > 1 ? " et " + plural(list.length - 1, "autre événement", "autres événements") : "") + ".";
  }
}
// Premier créneau libre de la durée choisie, dans les heures ouvrées, à partir du jour de la fiche.
function findFreeSlot() {
  var s = el.fStart.value, e = el.fEnd.value;
  var dur = s && e && toMin(e) > toMin(s) ? toMin(e) - toMin(s) : settings.dur;
  var day = parseKey(el.fDate.value || keyOf(new Date())), now = new Date(), todayK = keyOf(now);
  for (var i = 0; i < 30; i++, day = addDays(day, 1)) {
    var k = keyOf(day);
    if (k < todayK) continue;
    var from = settings.workStart * 60;
    if (k === todayK) from = Math.max(from, Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / SNAP) * SNAP);
    for (var m = from; m + dur <= settings.workEnd * 60; m += SNAP) {
      if (!overlaps(k, m, m + dur, editingId).length) {
        el.fDate.value = k; el.fStart.value = fromMin(m); el.fEnd.value = fromMin(m + dur);
        syncFields();
        setStatus("Créneau libre : " + fmtDate(k) + ", " + fromMin(m) + "–" + fromMin(m + dur) + ".", false);
        return;
      }
    }
  }
  setStatus("Aucun créneau libre de " + fmtDur(dur) + " dans les 30 prochains jours.", true);
}
byId("free-btn").addEventListener("click", findFreeSlot);
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
function pickTime(hid, allowClear) {
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
    if (allowClear) {
      var clr = el_("button", "btn danger", "Aucun");
      clr.type = "button";
      clr.addEventListener("click", function () { hid.value = ""; closeDialog(el.picker); syncFields(); });
      act.appendChild(clr);
    }
    var cancel = el_("button", "btn", "Annuler");
    cancel.type = "button";
    cancel.addEventListener("click", function () { closeDialog(el.picker); });
    var ok = el_("button", "btn primary", "Valider");
    ok.type = "button";
    ok.addEventListener("click", function () {
      var oldStart = el.fStart.value, oldEnd = el.fEnd.value;
      hid.value = pad(h) + ":" + pad(m);
      if (hid === el.fStart) {
        // Comme dans Google Agenda : la fin suit le début et la durée est conservée.
        var keep = oldStart && oldEnd && toMin(oldEnd) > toMin(oldStart) ? toMin(oldEnd) - toMin(oldStart) : settings.dur;
        el.fEnd.value = fromMin(Math.min(1439, toMin(hid.value) + keep));
      }
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
  byId("f-lock").checked = !!(ev && ev.lock);
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
    checklist: draftSubs, lock: byId("f-lock").checked
  });
  if (editingId) events = events.map(function (x) { return x.id === editingId ? data : x; });
  else events.push(data);
  if (pendingTaskId) { tasks = tasks.filter(function (t) { return t.id !== pendingTaskId; }); saveTasks(); }
  saveEvents();
  // Le Planning garde sa position ; ailleurs on suit l'événement (ou l'occurrence modifiée).
  if (state.view !== "agenda") state.cursor = parseKey(editingOcc && rule && occursOn(data, editingOcc) ? editingOcc : date);
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
  var copy = normalize(Object.assign(JSON.parse(JSON.stringify(src)), { id: uid(), uid: null, title: src.title + " (copie)", skip: [] }));
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
// Première occurrence d'un événement entre deux dates (incluses), ou null.
function firstOccurrence(ev, from, to) {
  if (!ev.rule && !(ev.allDay && ev.endDate)) return ev.date >= from && ev.date <= to ? ev.date : null;
  var d = parseKey(from > ev.date ? from : ev.date), last = parseKey(to);
  for (var i = 0; i < 800 && d <= last; i++, d = addDays(d, 1)) { var k = keyOf(d); if (occursOn(ev, k)) return k; }
  return null;
}
function scopeRange() {
  var t = startOfToday(), tk = keyOf(t);
  if (state.scope === "today") return [tk, tk];
  if (state.scope === "week") return [keyOf(mondayOf(t)), keyOf(addDays(mondayOf(t), 6))];
  if (state.scope === "month") return [keyOf(new Date(t.getFullYear(), t.getMonth(), 1)), keyOf(new Date(t.getFullYear(), t.getMonth() + 1, 0))];
  return null;
}
// Jour où ouvrir un résultat : l'occurrence dans la période, sinon la prochaine à partir d'aujourd'hui.
function resultDay(ev) {
  var r = scopeRange(), tk = keyOf(new Date());
  if (r) return firstOccurrence(ev, r[0], r[1]);
  if (!ev.rule) return ev.date;
  return firstOccurrence(ev, tk, keyOf(addDays(new Date(), 400))) || ev.date;
}
function runSearch(raw) {
  var q = raw.trim().toLowerCase();
  if (!q) return { events: [], tasks: [] };
  var evs = events.filter(function (e) {
    return resultDay(e) && ((e.title || "").toLowerCase().indexOf(q) >= 0 || (e.place || "").toLowerCase().indexOf(q) >= 0 ||
      (e.notes || "").toLowerCase().indexOf(q) >= 0 || e.date.indexOf(q) >= 0 || (e.tz || "").toLowerCase().indexOf(q) >= 0);
  }).map(function (e) { return Object.assign({}, e, { hit: resultDay(e) }); })
    .sort(function (a, b) { return a.hit < b.hit ? -1 : a.hit > b.hit ? 1 : (a.start < b.start ? -1 : 1); });
  var tks = tasks.filter(function (t) {
    return (t.rule ? !scopeRange() || firstOccurrence({ date: t.date, rule: t.rule, until: t.until, skip: [] }, scopeRange()[0], scopeRange()[1]) : inScope(t.date)) && ((t.title || "").toLowerCase().indexOf(q) >= 0 || t.date.indexOf(q) >= 0 ||
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
    var bt = el_("b", null, ev.title);
    var dot = el_("i", "rdot");
    dot.style.background = colorOf(ev);
    bt.insertBefore(dot, bt.firstChild);
    b.appendChild(bt);
    b.appendChild(el_("small", null, fmtDate(ev.hit) + " · " + timeLabel(ev) + (ev.place ? " · " + ev.place : "") + repLabel(ev)));
    b.addEventListener("click", function () { jump(ev.hit); });
    el.results.appendChild(b);
  });
  r.tasks.forEach(function (t) {
    var b = el_("button", "result");
    b.type = "button";
    b.appendChild(el_("b", null, (taskDone(t, t.date) ? "✓ " : "☐ ") + t.title));
    b.appendChild(el_("small", null, fmtDate(t.date) + " · tâche" + (t.rule ? " · " + RULE_LABELS[t.rule] : "")));
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
