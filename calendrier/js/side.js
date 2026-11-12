/* Barre latérale (ordinateur) : mini-calendrier, à venir, tâches du jour. */
"use strict";

// ---------- Barre latérale (ordinateur) : mini-calendrier, à venir, tâches du jour ----------
var miniMonth = null, miniFor = "";
function renderSide() {
  if (!isDesk()) return;
  renderMini();
  renderUpNext();
  renderSideTasks();
}
function renderMini() {
  var box = byId("mini"), c = state.cursor, todayK = keyOf(new Date()), selK = keyOf(c);
  // Le mini-calendrier suit le jour affiché, sauf pendant qu'on le feuillette.
  if (!miniMonth || miniFor !== selK) { miniMonth = new Date(c.getFullYear(), c.getMonth(), 1); miniFor = selK; }
  box.innerHTML = "";
  var head = el_("div", "mini-head");
  head.appendChild(el_("b", null, cap(MONTHS[miniMonth.getMonth()]) + " " + miniMonth.getFullYear()));
  [[-1, "M15 6l-6 6 6 6", "Mois précédent"], [1, "M9 6l6 6-6 6", "Mois suivant"]].forEach(function (a) {
    var b = el_("button");
    b.type = "button";
    b.setAttribute("aria-label", a[2]);
    b.appendChild(svgIcon(a[1]));
    b.addEventListener("click", function () { miniMonth = new Date(miniMonth.getFullYear(), miniMonth.getMonth() + a[0], 1); renderMini(); });
    head.appendChild(b);
  });
  box.appendChild(head);
  var grid = el_("div", "mini-grid");
  weekLabels().forEach(function (n) { grid.appendChild(el_("span", "dn", n.charAt(0))); });
  var start = addDays(miniMonth, -dowIdx(miniMonth));
  var weeks = Math.ceil((dowIdx(miniMonth) + new Date(miniMonth.getFullYear(), miniMonth.getMonth() + 1, 0).getDate()) / 7);
  for (var i = 0; i < weeks * 7; i++) {
    (function (d) {
      var k = keyOf(d);
      var b = el_("button", null, String(d.getDate()));
      b.type = "button";
      b.setAttribute("data-key", k);
      if (d.getMonth() !== miniMonth.getMonth()) b.classList.add("out");
      if (k === todayK) b.classList.add("today");
      if (k === selK) b.classList.add("sel");
      if (rawEventsOn(k).length) b.classList.add("has");
      b.setAttribute("aria-label", d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear());
      b.addEventListener("click", function () { state.cursor = d; render(true); });
      grid.appendChild(b);
    })(addDays(start, i));
  }
  box.appendChild(grid);
}
function renderUpNext() {
  var box = byId("upnext");
  box.innerHTML = "";
  var now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes(), today = startOfToday(), found = 0;
  for (var i = 0; i < 30 && found < 4; i++) {
    var d = addDays(today, i), k = keyOf(d);
    eventsOn(k).forEach(function (ev) {
      if (found >= 4) return;
      if (i === 0 && !ev.allDay && endMin(ev) <= nowMin) return;
      if (ev.allDay && ev.endDate && ev.date < k) return;
      found++;
      var b = el_("button", "up-item");
      b.type = "button";
      var dot = el_("i");
      dot.style.background = colorOf(ev);
      b.appendChild(dot);
      b.appendChild(el_("b", null, ev.title));
      var when = i === 0 ? "Aujourd'hui" : i === 1 ? "Demain" : cap(DAYS[d.getDay()]) + " " + shortDay(k);
      b.appendChild(el_("small", null, when + " · " + (ev.allDay ? "journée" : ev.start + "–" + ev.end)));
      b.addEventListener("click", function () { openSheet(k, masterOf(ev.id), null); });
      box.appendChild(b);
    });
  }
  if (!found) box.appendChild(el_("p", "hint", "Rien de prévu dans les 30 prochains jours."));
}
function renderSideTasks() {
  var box = byId("side-tasks"), k = keyOf(new Date());
  var hadFocus = document.activeElement && document.activeElement.id === "side-task-input";
  box.innerHTML = "";
  var wrap = el_("div", "tasks-body");
  var form = el_("form", "task-form");
  form.setAttribute("novalidate", "");
  var input = el_("input");
  input.type = "text";
  input.id = "side-task-input";
  input.maxLength = 120;
  input.placeholder = "Ajouter une tâche";
  input.setAttribute("aria-label", "Nouvelle tâche pour aujourd'hui");
  var add = el_("button", "btn small primary", "Ajouter");
  add.type = "submit";
  form.appendChild(input);
  form.appendChild(add);
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var title = input.value.trim();
    if (!title) { input.focus(); return; }
    tasks.push(normalizeTask({ title: title, date: k, created: Date.now() }));
    saveTasks();
    refresh();
    var again = byId("side-task-input");
    if (again) again.focus();
  });
  wrap.appendChild(form);
  var list = tasksOn(k);
  if (!list.length) wrap.appendChild(el_("p", "hint", state.openOnly ? "Plus rien à faire aujourd'hui." : "Aucune tâche aujourd'hui."));
  else {
    var ul = el_("div", "task-list");
    list.forEach(function (t) { ul.appendChild(taskRow(t, { day: k })); });
    wrap.appendChild(ul);
  }
  box.appendChild(wrap);
  if (hadFocus) byId("side-task-input").focus();
}
