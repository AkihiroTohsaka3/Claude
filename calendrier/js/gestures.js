/* Gestes : appui long puis glisser pour déplacer, étirer ou créer. */
"use strict";

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
      moveGhost(g.sx, g.sy, g.ghost); dragging = true;
      try { col.setPointerCapture(g.pid); } catch (err) { /* ignoré */ }
    }, 300);
  });
  col.addEventListener("pointermove", function (e) {
    if (!g.active) { if (Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy) > 10) clearTimeout(g.timer); return; }
    moveGhost(e.clientX, e.clientY, g.ghost);
    var hit = document.elementFromPoint(e.clientX, e.clientY);
    var c = hit && hit.closest ? hit.closest(".wday[data-key]") : null;
    if (c) g.endK = c.getAttribute("data-key");
  });
  function end(e, drop) {
    clearTimeout(g.timer);
    if (!g.active) return;
    g.active = false;
    dragging = false;
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
      moveGhost(g.sx, g.sy, g.ghost); dragging = true;
      try { btn.setPointerCapture(g.pid); } catch (err) { /* ignoré */ }
    }, 300);
  });
  btn.addEventListener("pointermove", function (e) {
    if (!g.active) { if (Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy) > 10) clearTimeout(g.timer); return; }
    moveGhost(e.clientX, e.clientY, g.ghost);
  });
  function end(e, drop) {
    clearTimeout(g.timer);
    if (!g.active) return;
    g.active = false;
    dragging = false;
    if (g.ghost) { g.ghost.remove(); g.ghost = null; }
    suppressClick = true;
    setTimeout(function () { suppressClick = false; }, 350);
    if (!drop) return;
    var target = dayAt(e.clientX, e.clientY);
    if (target) moveEventTo(id, target, fromK);
  }
  btn.addEventListener("pointerup", function (e) { end(e, true); });
  btn.addEventListener("pointercancel", function (e) { end(e, false); });
}
// Appui long sur un événement puis glissement : déplace l'événement vers un autre jour.
// Appui long sur une case libre puis glissement : crée un événement sur plusieurs jours.
function moveEventTo(id, targetK, fromK) {
  var ev = masterOf(id);
  if (!ev) return;
  if (isFixed(ev)) { fixedNotice(ev); refresh(); return; }
  var offerUndo = undoPoint("Événement déplacé au " + shortDay(targetK));
  if (ev.rule) {
    // Occurrence d'une série : elle est retirée de la série et recréée ponctuellement au nouveau jour.
    var from = fromK || ev.date;
    if (targetK === from) return;
    ev.skip = (ev.skip || []).concat([from]);
    events.push(normalize(Object.assign({}, ev, { id: uid(), uid: null, date: targetK, rule: null, until: null, skip: [], endDate: null })));
    saveEvents();
    refresh();
    offerUndo();
    return;
  }
  var origin = fromK && ev.endDate && fromK >= ev.date && fromK <= ev.endDate ? fromK : ev.date;
  if (targetK === origin) return;
  var delta = Math.round((parseKey(targetK) - parseKey(origin)) / 86400000);
  var newStart = keyOf(addDays(parseKey(ev.date), delta));
  ev.date = newStart;
  if (ev.endDate) ev.endDate = keyOf(addDays(parseKey(ev.endDate), delta));
  saveEvents();
  refresh();
  offerUndo();
}
function bindMonthCell(cell, startK) {
  var g = { timer: null, active: false, mode: null, sx: 0, sy: 0, endK: startK, evId: null, ghost: null, pid: null };
  cell.addEventListener("pointerdown", function (e) {
    if (e.button > 0) return;
    var chip = e.target.closest ? e.target.closest(".chip, .dots i, .mbar") : null;
    g.mode = chip ? "move" : "range";
    g.evId = chip ? chip.getAttribute("data-id") : null;
    g.evDay = startK;
    if (chip && chip.classList.contains("mbar")) {
      // Barre sur plusieurs jours : le jour saisi est celui sous le doigt.
      var box = chip.parentNode, r = box.getBoundingClientRect();
      var col = clamp(Math.floor((e.clientX - r.left) / r.width * 7), 0, 6);
      g.evDay = keyOf(addDays(parseKey(box.getAttribute("data-row")), col));
    }
    if (g.mode === "move" && !g.evId) return;
    g.sx = e.clientX; g.sy = e.clientY; g.endK = startK; g.pid = e.pointerId;
    clearTimeout(g.timer);
    g.timer = setTimeout(function () {
      g.active = true;
      buzz(8);
      g.ghost = el_("div", "ghost", g.mode === "move" ? "Déplacer l'événement" : "Période");
      document.body.appendChild(g.ghost);
      moveGhost(g.sx, g.sy, g.ghost); dragging = true;
      try { cell.setPointerCapture(g.pid); } catch (err) { /* ignoré */ }
    }, 300);
  });
  cell.addEventListener("pointermove", function (e) {
    if (!g.active) { if (Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy) > 10) clearTimeout(g.timer); return; }
    moveGhost(e.clientX, e.clientY, g.ghost);
    var hit = document.elementFromPoint(e.clientX, e.clientY);
    var c = hit && hit.closest ? hit.closest(".cell[data-key]") : null;
    if (c) g.endK = c.getAttribute("data-key");
  });
  function end(e, drop) {
    clearTimeout(g.timer);
    if (!g.active) return;
    g.active = false;
    dragging = false;
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

// Appui maintenu puis glisser sur la grille : crée un événement de la durée tracée.
function bindSlotCreate(slots, k) {
  slots.addEventListener("pointerdown", function (e) {
    if (e.button > 0 || (e.target.closest && e.target.closest(".evb"))) return;
    var P = ppm(), rect = slots.getBoundingClientRect();
    var g = { y0: e.clientY - rect.top, y1: e.clientY - rect.top, active: false, timer: null, sy: e.clientY, sx: e.clientX };
    var prev = el_("div", "dcreate");
    function snapMin(y) { return Math.round(y / P / SNAP) * SNAP; }
    function place() {
      var a = clamp(snapMin(Math.min(g.y0, g.y1)), 0, 1440), b = clamp(snapMin(Math.max(g.y0, g.y1)), 0, 1440);
      prev.style.top = (a * P) + "px";
      prev.style.height = (Math.max(SNAP, b - a) * P) + "px";
    }
    function cleanup() {
      clearTimeout(g.timer);
      dragging = false;
      slots.removeEventListener("pointermove", move);
      slots.removeEventListener("pointerup", up);
      slots.removeEventListener("pointercancel", cancel);
      prev.remove();
    }
    function move(ev) {
      if (!g.active) { if (Math.abs(ev.clientY - g.sy) + Math.abs(ev.clientX - g.sx) > 8) cleanup(); return; }
      g.y1 = ev.clientY - rect.top;
      place();
    }
    function cancel() { cleanup(); g.active = false; }
    function up() {
      var wasActive = g.active;
      cleanup();
      if (!wasActive) return;
      g.active = false;
      var a = clamp(snapMin(Math.min(g.y0, g.y1)), 0, 1440 - SNAP);
      var b = clamp(snapMin(Math.max(g.y0, g.y1)), a + SNAP, 1440);
      suppressClick = true;
      setTimeout(function () { suppressClick = false; }, 350);
      openSheet(k, null, a);
      // Un simple appui long (sans glisser) garde la durée par défaut.
      if (b - a > SNAP) el.fEnd.value = fromMin(b);
      syncFields();
    }
    g.timer = setTimeout(function () {
      g.active = true;
      dragging = true;
      slots.appendChild(prev);
      place();
      buzz(8);
      try { slots.setPointerCapture(e.pointerId); } catch (err) { /* ignoré */ }
    }, 250);
    slots.addEventListener("pointermove", move);
    slots.addEventListener("pointerup", up);
    slots.addEventListener("pointercancel", cancel);
  });
}

// Glisser un événement de la grille (appui long) : change son heure, et son jour s'il passe dans une autre colonne.
// La poignée du bas change sa durée. Tout se fait par pas de 15 min.
function bindEventDrag(b, p, k) {
  var g = { mode: null, sy: 0, active: false, timer: null, moved: false, snap: 0, cols: [], home: null, targetK: k };
  var dur = endMin(p.ev) - toMin(p.ev.start);
  function measure() {
    g.cols = Array.prototype.map.call(document.querySelectorAll(".slots[data-day]"), function (sl) {
      var r = sl.getBoundingClientRect();
      return { k: sl.getAttribute("data-day"), left: r.left, right: r.right };
    });
    g.home = g.cols.filter(function (c) { return c.k === k; })[0] || null;
  }
  b.addEventListener("pointerdown", function (e) {
    if (e.button > 0) return;
    var isGrip = e.target.classList && e.target.classList.contains("grip");
    g.mode = isGrip ? "resize" : "move";
    g.sy = e.clientY; g.moved = false; g.snap = 0; g.targetK = k;
    g.active = isGrip;
    if (isGrip) dragging = true;
    try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignoré */ }
    clearTimeout(g.timer);
    if (!isGrip) g.timer = setTimeout(function () { g.active = true; dragging = true; measure(); b.classList.add("lift"); buzz(10); }, 260);
    else e.stopPropagation();
  });
  b.addEventListener("pointermove", function (e) {
    if (!g.active) { if (Math.abs(e.clientY - g.sy) > 8) { clearTimeout(g.timer); g.timer = null; } return; }
    var P = ppm(), dy = e.clientY - g.sy;
    g.snap = Math.round(dy / P / SNAP) * SNAP;
    if (g.mode === "resize") {
      if (Math.abs(dy) > 4) g.moved = true;
      b.style.height = (Math.max(SNAP, (p.to - p.from) + g.snap) * P) + "px";
      return;
    }
    var dx = 0;
    if (g.home) {
      var over = g.cols.filter(function (c) { return e.clientX >= c.left && e.clientX < c.right; })[0];
      if (over) { g.targetK = over.k; dx = over.left - g.home.left; }
    }
    if (Math.abs(dy) > 4 || g.targetK !== k) g.moved = true;
    b.style.transform = "translate(" + dx + "px, " + (g.snap * P) + "px)";
  });
  function finish(commit) {
    clearTimeout(g.timer);
    b.classList.remove("lift");
    b.style.transform = "";
    var wasActive = g.active;
    g.active = false;
    dragging = false;
    if (!wasActive) return;
    var sn = g.snap, dayChanged = g.mode === "move" && g.targetK !== k;
    g.snap = 0;
    suppressClick = true;
    setTimeout(function () { suppressClick = false; }, 350);
    var ev = commit && g.moved && (sn || dayChanged) ? masterOf(p.ev.id) : null;
    if (isFixed(ev)) { fixedNotice(ev); refresh(); return; }
    if (!ev) { refresh(); return; }
    var offerUndo = undoPoint(g.mode === "move" ? "Événement déplacé" : "Durée modifiée");
    if (ev.rule) {
      // Occurrence d'une série : seule cette date change, le reste de la série reste en place.
      var occ = p.ev.occDate || ev.date;
      ev.skip = (ev.skip || []).concat([occ]);
      ev = normalize(Object.assign({}, ev, { id: uid(), uid: null, date: occ, rule: null, until: null, skip: [], endDate: null }));
      events.push(ev);
    }
    if (g.mode === "move") {
      var ns = clamp(toMin(ev.start) + sn, 0, 1440 - dur);
      ev.start = fromMin(ns);
      ev.end = fromMin(ns + dur);
      if (dayChanged) ev.date = keyOf(addDays(parseKey(ev.date), Math.round((parseKey(g.targetK) - parseKey(k)) / 86400000)));
    } else {
      ev.end = fromMin(clamp(endMin(ev) + sn, toMin(ev.start) + SNAP, 1439));
    }
    saveEvents();
    refresh();
    offerUndo();
  }
  b.addEventListener("pointerup", function () { finish(true); });
  b.addEventListener("pointercancel", function () { finish(false); });
}

// Glisser une tâche (appui long) : sur la grille horaire elle devient un événement, sur un autre jour elle change de date.
var ghost = null;
function bindTaskDrag(row, t, k) {
  var g = { timer: null, active: false, x: 0, y: 0 };
  row.addEventListener("pointerdown", function (e) {
    if (e.button > 0 || e.target.closest(".check, .x, .tbtn, .star, textarea, input")) return;
    g.x = e.clientX; g.y = e.clientY;
    clearTimeout(g.timer);
    g.timer = setTimeout(function () {
      g.active = true;
      dragging = true;
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
    dragging = false;
    if (ghost) { ghost.remove(); ghost = null; }
    suppressClick = true;
    setTimeout(function () { suppressClick = false; }, 350);
    if (!drop) return;
    var hit = document.elementFromPoint(e.clientX, e.clientY);
    var col = hit && hit.closest ? hit.closest(".slots[data-day]") : null;
    if (col) {
      var r = col.getBoundingClientRect();
      planTask(t, col.getAttribute("data-day"), clamp(Math.round((e.clientY - r.top) / ppm() / SNAP) * SNAP, 0, 1440 - 60));
      return;
    }
    var target = dayAt(e.clientX, e.clientY), cur = taskById(t.id);
    if (target && cur && !cur.rule && target !== k) {
      var offerUndo = undoPoint("Tâche déplacée au " + shortDay(target));
      cur.date = target;
      saveTasks();
      refresh();
      offerUndo();
    }
  }
  row.addEventListener("pointerup", function (e) { end(e, true); });
  row.addEventListener("pointercancel", function (e) { end(e, false); });
}
function moveGhost(x, y, node) {
  var n = node || ghost;
  if (n) { n.style.left = x + "px"; n.style.top = (y - 12) + "px"; }
}
