/* Export et import au format iCalendar (.ics). */
"use strict";

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
      (e.skip || []).forEach(function (k) {
        if (e.allDay) lines.push("EXDATE;VALUE=DATE:" + icsKey(k));
        else lines.push("EXDATE" + (e.tz ? ";TZID=" + e.tz : "") + ":" + icsDateTime(k, e.start));
      });
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
function validZone(z) {
  if (!z) return "";
  z = z.replace(/^"|"$/g, "");
  try { new Intl.DateTimeFormat("fr-FR", { timeZone: z }); return z; } catch (e) { return ""; }
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
    var v = val.trim().toUpperCase();
    if (base === "BEGIN" && (v === "VEVENT" || v === "VTODO")) { cur = { kind: v, raw: { alarms: [] }, alarm: false }; return; }
    if (!cur) return;
    // Les rappels (VALARM) sont des blocs imbriqués : leurs lignes ne doivent pas écraser celles de l'événement.
    if (base === "BEGIN") { cur.alarm = true; return; }
    if (base === "END" && v === "VALARM") { cur.alarm = false; return; }
    if (base === "END" && v === cur.kind) { (cur.kind === "VEVENT" ? blocks.events : blocks.tasks).push(cur.raw); cur = null; return; }
    if (cur.alarm) {
      var tm = base === "TRIGGER" ? /^-P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(v) : null;
      if (tm) { var mins = (+tm[1] || 0) * 1440 + (+tm[2] || 0) * 60 + (+tm[3] || 0); if (mins > 0) cur.raw.alarms.push(mins); }
      return;
    }
    if (base === "EXDATE") { (cur.raw.EXDATE = cur.raw.EXDATE || []).push({ name: name, val: val }); return; }
    if (!cur.raw[base]) cur.raw[base] = { name: name, val: unescapeIcs(val) };
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
      var intM = /INTERVAL=(\d+)/.exec(rv), every = 1, unit = "day";
      if (intM && +intM[1] > 1 && (rule === "daily" || rule === "weekly")) { every = +intM[1]; unit = rule === "weekly" ? "week" : "day"; rule = "every"; }
    }
    var skip = [];
    (r.EXDATE || []).forEach(function (x) {
      x.val.split(",").forEach(function (v) { if (v.trim()) skip.push(parseIcsDate(x.name, v.trim()).date); });
    });
    var ev = normalize({
      id: uid(), uid: uidVal, title: r.SUMMARY.val, date: s.date, start: start, end: end, allDay: allDay, endDate: endDate,
      place: r.LOCATION ? r.LOCATION.val : "", notes: r.DESCRIPTION ? r.DESCRIPTION.val : "", color: COLORS[2], rule: rule, until: until,
      every: typeof every === "number" ? every : 1, unit: typeof unit === "string" ? unit : "day", skip: skip,
      reminds: r.alarms.filter(function (m, i, a) { return a.indexOf(m) === i; }).slice(0, 4),
      tz: validZone((/TZID=([^;:]+)/.exec(r.DTSTART.name) || [])[1])
    });
    // COUNT=n : la série s'arrête à la n-ième occurrence.
    var countM = r.RRULE && rule ? /COUNT=(\d+)/.exec(r.RRULE.val) : null;
    if (countM && !ev.until) {
      var left = +countM[1], d = parseKey(ev.date);
      for (var guard = 0; guard < 3660 && left > 0; guard++, d = addDays(d, 1)) {
        if (occursOn({ date: ev.date, rule: ev.rule, every: ev.every, unit: ev.unit, skip: [] }, keyOf(d))) { left--; if (!left) ev.until = keyOf(d); }
      }
    }
    events.push(ev);
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
