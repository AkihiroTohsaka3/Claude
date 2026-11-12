/* Ma journée à la voix : on raconte sa journée en parlant, Claude en fait un emploi du temps.
 *
 * Dictée : celle de Claude (capacité « dictation ») quand la page est ouverte dans Claude,
 * sinon la reconnaissance vocale du navigateur (Chrome, Edge), sinon le clavier.
 * Organisation : Claude (capacité « sample ») ; sans lui, un planificateur simple sur l'appareil.
 * Rien n'entre dans le calendrier avant l'appui sur « Ajouter au calendrier ».
 */
"use strict";

var KEY_VOICE = "cal-voice-draft-v1";
// Type d'activité → catégorie (couleur) du calendrier.
var VOICE_TYPES = { rdv: 0, perso: 0, etudes: 1, travail: 1, pratique: 2, trajet: 2, sport: 3, loisir: 3, repas: 4, pause: 4, sante: 4 };
// Sans avis de Claude (planificateur local), le Locker est activé pour les études et le travail.
var LOCK_TYPES = { etudes: true, travail: true };
var VOICE_LABELS = {
  rdv: "Rendez-vous", perso: "Perso", etudes: "Études", travail: "Travail", pratique: "Pratique", trajet: "Trajet",
  sport: "Sport", loisir: "Loisir", repas: "Repas", pause: "Pause", sante: "Santé"
};

var voice = { day: null, plan: null, ctl: null, prevStep: "compose", speaking: false };
var vEl = {
  dlg: byId("voice"), close: byId("voice-close"), days: byId("v-days"),
  compose: byId("v-compose"), think: byId("v-think"), preview: byId("v-preview"),
  mic: byId("v-mic"), micLabel: byId("v-mic-label"), text: byId("v-text"), partial: byId("v-partial"),
  context: byId("v-context"), extras: byId("v-extras"), status: byId("v-status"), clear: byId("v-clear"), go: byId("v-go"),
  thinkText: byId("v-think-text"), stop: byId("v-stop"),
  sum: byId("v-sum"), notes: byId("v-notes"), blocks: byId("v-blocks"), tasksTitle: byId("v-tasks-title"), tasks: byId("v-tasks"),
  fixBox: byId("v-fixbox"), fixMic: byId("v-fix-mic"), fix: byId("v-fix"), fixGo: byId("v-fix-go"), fixPartial: byId("v-fix-partial"),
  source: byId("v-source"), status2: byId("v-status2"), back: byId("v-back"), listen: byId("v-listen"), add: byId("v-add")
};

// Capacités de la page dans Claude ; ailleurs, window.claude n'existe pas et tout reste local.
function useCap(name) {
  if (!window.claude || typeof window.claude.use !== "function") return Promise.resolve(null);
  try { return window.claude.use(name).then(null, function () { return null; }); } catch (e) { return Promise.resolve(null); }
}
var samplePromise = useCap("sample");
var sampleFn = null, sampleOff = false;
samplePromise.then(function (s) { sampleFn = s; });

function voiceStatus(msg, isError, box) {
  box = box || (vEl.preview.hidden ? vEl.status : vEl.status2);
  box.textContent = msg || "";
  box.className = "status" + (isError ? " error" : "");
}

// ---------- Dictée ----------
// Dans Claude, la page ne peut pas ouvrir le micro elle-même : sans la dictée de Claude
// (applications mobiles, Safari…), on passe par le micro du clavier du téléphone.
var SR = window.claude ? null : (window.SpeechRecognition || window.webkitSpeechRecognition || null);
var dict = { claude: null, ready: !(window.claude && window.claude.use), web: null, state: "idle", target: null, denied: false, deniedBy: "", frOff: false };

useCap("dictation").then(function (d) {
  dict.ready = true;
  if (d) {
    dict.claude = d;
    d.onPartial(function (e) { showPartial(e.text); });
    d.onFinal(function (e) { appendSpeech(e.text); });
    d.onState(function (e) { setMicState(e.state, e.reason); });
  }
  drawMic();
});

function micAvailable() { return !dict.denied && !!(dict.claude || SR); }
function partialBox() { return dict.target === vEl.fix ? vEl.fixPartial : vEl.partial; }
function showPartial(t) { partialBox().textContent = t || ""; }
function appendSpeech(t) {
  var f = dict.target;
  if (!f || !t) return;
  t = String(t);
  if (!f.value.trim()) t = t.replace(/^\s+/, "");
  else if (!/^\s/.test(t) && !/\s$/.test(f.value)) t = " " + t;
  f.value = (f.value + t).slice(0, f.maxLength > 0 ? f.maxLength : 4000);
  if (f === vEl.text) saveVoiceDraft();
  updateGo();
}

var MIC_TEXT = {
  idle: "Appuie et raconte ta journée",
  starting: "Préparation du micro…",
  listening: "Je t'écoute… appuie pour terminer",
  finishing: "Je termine…"
};
function drawMic() {
  var on = dict.state !== "idle";
  var avail = micAvailable(), kb = dict.ready && !avail;
  [vEl.mic, vEl.fixMic].forEach(function (b) {
    var mine = on && (b === vEl.mic ? dict.target === vEl.text : dict.target === vEl.fix);
    b.setAttribute("aria-pressed", mine ? "true" : "false");
    b.setAttribute("data-state", mine ? dict.state : "idle");
    b.setAttribute("data-mode", kb ? "keyboard" : "");
  });
  vEl.mic.setAttribute("aria-label", kb ? "Dicter avec le micro du clavier" : "Dicter");
  vEl.mic.hidden = false;
  vEl.fixMic.hidden = false;
  if (!dict.ready && !SR) { vEl.mic.disabled = true; vEl.micLabel.textContent = "Préparation du micro…"; return; }
  vEl.mic.disabled = false;
  if (kb) {
    vEl.micLabel.textContent = dict.denied && dict.deniedBy === "claude"
      ? "Micro refusé pour cette page (tu peux l'autoriser dans ses autorisations). En attendant : appuie ici, puis sur 🎤 de ton clavier."
      : "Ici, la dictée passe par ton clavier : appuie sur le micro, puis sur 🎤 du clavier et parle.";
    return;
  }
  vEl.micLabel.textContent = dict.target === vEl.text || !on ? MIC_TEXT[on ? dict.state : "idle"] : MIC_TEXT.idle;
}
function setMicState(st, reason) {
  dict.state = st;
  if (st === "idle") {
    showPartial("");
    if (reason === "not_granted") { dict.denied = true; dict.deniedBy = "claude"; }
    var msg = { hidden: "Dictée interrompue quand la page a été masquée.", time_limit: "Dictée arrêtée au bout d'une heure.", rate_limited: "Trop de dictées en même temps : réessaie dans un instant.", upstream_error: "Le micro ou la dictée a eu un souci. Réessaie." }[reason];
    if (msg) voiceStatus(msg, true);
  }
  drawMic();
}
// L'arrêt est toujours envoyé (il ne coûte rien si la dictée est déjà arrêtée), et le bouton
// revient au repos même si la dictée ne le confirme pas.
var stopGuard = null;
function stopDictation() {
  if (dict.claude) {
    var listening = dict.state !== "idle";
    if (listening) setMicState("finishing");
    var settle = function () {
      clearTimeout(stopGuard);
      stopGuard = setTimeout(function () { if (dict.state !== "idle") setMicState("idle"); }, 400);
    };
    try { Promise.resolve(dict.claude.stop()).then(settle, settle); } catch (e) { settle(); }
    if (listening) { clearTimeout(stopGuard); stopGuard = setTimeout(function () { if (dict.state !== "idle") setMicState("idle"); }, 4000); }
  }
  if (dict.web) { try { dict.web.stop(); } catch (e) { /* ignoré */ } }
}
// À appeler directement depuis l'appui sur le micro : la dictée doit démarrer sans attendre.
function toggleMic(target) {
  if (dict.state !== "idle") {
    var same = dict.target === target;
    stopDictation();
    if (same) return;
  }
  clearTimeout(stopGuard);
  // Sans dictée possible ici : le champ prend le focus, le clavier s'ouvre avec son propre micro.
  if (!micAvailable()) { target.focus(); return; }
  if (tts && voice.speaking) tts.stop();
  dict.target = target;
  voiceStatus("");
  if (dict.claude) {
    dict.claude.start(dict.frOff ? undefined : { language: "fr" }).catch(function (e) {
      var code = e && e.code;
      if (code === "stopped") return;
      if (code === "not_granted") { dict.denied = true; dict.deniedBy = "claude"; drawMic(); target.focus(); return; }
      if (code === "unavailable") {
        if (!dict.frOff) { dict.frOff = true; voiceStatus("Dictée en français indisponible ici. Appuie à nouveau sur le micro pour réessayer.", true); return; }
        dict.claude = null; drawMic(); return;
      }
      voiceStatus({ dismissed: "Autorise la dictée pour parler, ou écris ta journée.", rate_limited: "Trop de dictées en même temps : réessaie dans un instant." }[code] || "La dictée n'a pas démarré. Réessaie, ou écris ta journée.", true);
    });
    return;
  }
  if (SR) startWebSpeech(target);
}
function startWebSpeech(target) {
  var rec;
  try { rec = new SR(); } catch (e) { SR = null; drawMic(); return; }
  rec.lang = "fr-FR";
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = function (ev) {
    var interim = "";
    for (var i = ev.resultIndex; i < ev.results.length; i++) {
      var r = ev.results[i];
      if (r.isFinal) appendSpeech(r[0].transcript); else interim += r[0].transcript;
    }
    showPartial(interim);
  };
  rec.onerror = function (ev) {
    if (ev.error === "not-allowed" || ev.error === "service-not-allowed") { dict.denied = true; dict.deniedBy = "web"; voiceStatus("Micro refusé par le navigateur : utilise le micro de ton clavier, ou autorise le micro pour cette page.", true); }
    // « network » : le navigateur n'a pas de service de dictée (Brave, par exemple) → micro du clavier.
    else if (ev.error === "network" || ev.error === "audio-capture" || ev.error === "language-not-supported") { SR = null; voiceStatus("Ce navigateur ne fait pas la dictée lui-même : appuie sur le micro, puis sur 🎤 de ton clavier.", true); }
    else if (ev.error === "no-speech") voiceStatus("Je n'ai rien entendu. Appuie sur le micro et parle.", true);
    else if (ev.error !== "aborted") voiceStatus("La dictée a eu un souci (" + ev.error + "). Réessaie.", true);
  };
  rec.onend = function () { if (dict.web === rec) { dict.web = null; setMicState("idle"); } };
  try { rec.start(); dict.web = rec; setMicState("listening"); } catch (e) { voiceStatus("Impossible de démarrer la dictée.", true); }
}
vEl.mic.addEventListener("click", function () { toggleMic(vEl.text); });
vEl.fixMic.addEventListener("click", function () { toggleMic(vEl.fix); });

// ---------- Lecture à voix haute du programme ----------
var tts = null;
useCap("tts").then(function (t) {
  tts = t;
  if (!t) return;
  t.onState(function (e) {
    voice.speaking = e.state !== "idle";
    vEl.listen.textContent = voice.speaking ? "Arrêter la lecture" : "Écouter";
  });
  vEl.listen.hidden = vEl.preview.hidden;
});
function spokenTime(m) {
  var h = Math.floor(m / 60), mi = m % 60;
  if (h === 12 && !mi) return "midi";
  return h + " h" + (mi ? " " + mi : "");
}
vEl.listen.addEventListener("click", function () {
  if (!tts || !voice.plan) return;
  if (voice.speaking) { tts.stop(); return; }
  var p = voice.plan, parts = [];
  if (p.summary) parts.push(p.summary);
  allRows(voice.day).forEach(function (r) {
    if (r.fixed || r.keep) parts.push("À " + spokenTime(r.start) + ", " + r.title + (r.lock ? ", en Locker" : "") + (r.fixed ? ", déjà prévu." : "."));
  });
  var tk = p.tasks.filter(function (t) { return t.keep; }).map(function (t) { return t.title; });
  if (tk.length) parts.push("Sans horaire : " + tk.join(", ") + ".");
  tts.speak(parts.join(" ").slice(0, 2000), { language: "fr" }).catch(function (e) {
    if (e && e.code === "not_granted") { tts = null; vEl.listen.hidden = true; }
  });
});

// ---------- Brouillon (gardé sur cet appareil) ----------
function saveVoiceDraft() { writeStore(KEY_VOICE, JSON.stringify({ text: vEl.text.value, extras: vEl.extras.checked })); }
function loadVoiceDraft() { try { return JSON.parse(readStore(KEY_VOICE) || "null"); } catch (e) { return null; } }
vEl.text.addEventListener("input", function () { saveVoiceDraft(); updateGo(); });
vEl.extras.addEventListener("change", saveVoiceDraft);
vEl.clear.addEventListener("click", function () {
  stopDictation();
  vEl.text.value = "";
  showPartial("");
  saveVoiceDraft();
  updateGo();
  voiceStatus("");
});
function updateGo() { vEl.go.disabled = !vEl.text.value.trim(); }

// ---------- Fenêtre ----------
function longDay(k) { var d = parseKey(k); return DAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear(); }
function defaultVoiceDay() {
  var todayK = keyOf(new Date()), cur = keyOf(state.cursor);
  if (state.view === "day" && cur >= todayK) return cur;
  return new Date().getHours() >= 21 ? keyOf(addDays(startOfToday(), 1)) : todayK;
}
function renderVoiceDays() {
  var todayK = keyOf(new Date()), tomK = keyOf(addDays(startOfToday(), 1));
  vEl.days.innerHTML = "";
  [[todayK, "Aujourd'hui"], [tomK, "Demain"]].forEach(function (o) {
    var b = el_("button", "opt", o[1]);
    b.type = "button";
    b.setAttribute("aria-pressed", voice.day === o[0] ? "true" : "false");
    b.addEventListener("click", function () { voice.day = o[0]; renderVoiceDays(); });
    vEl.days.appendChild(b);
  });
  var other = voice.day !== todayK && voice.day !== tomK;
  var pick = el_("button", "opt", other ? cap(DAYS[parseKey(voice.day).getDay()]) + " " + shortDay(voice.day) : "Autre jour…");
  pick.type = "button";
  pick.setAttribute("aria-pressed", other ? "true" : "false");
  pick.addEventListener("click", function () {
    pickDate(null, false, function (k) { voice.day = k; renderVoiceDays(); }, "Quel jour organiser ?");
  });
  vEl.days.appendChild(pick);
  renderVoiceContext();
}
function renderVoiceContext() {
  var k = voice.day, evs = rawEventsOn(k), tks = allTasksOn(k).filter(function (t) { return !taskDone(t, k); });
  var parts = [];
  if (evs.length) parts.push(plural(evs.length, "événement déjà prévu", "événements déjà prévus") + " (" + evs.slice(0, 3).map(function (e) { return e.allDay ? e.title : e.start + " " + e.title; }).join(", ") + (evs.length > 3 ? "…" : "") + ")");
  if (tks.length) parts.push(plural(tks.length, "tâche déjà notée", "tâches déjà notées"));
  vEl.context.textContent = parts.length ? cap(longDay(k)) + " : " + parts.join(" et ") + ". Ta journée sera organisée autour." : cap(longDay(k)) + " : rien de prévu pour l'instant.";
}
function showStep(name) {
  vEl.compose.hidden = name !== "compose";
  vEl.think.hidden = name !== "think";
  vEl.preview.hidden = name !== "preview";
  vEl.listen.hidden = !tts || name !== "preview";
}
function openVoice(k) {
  voice.day = k || defaultVoiceDay();
  voice.plan = null;
  if (!vEl.text.value.trim()) {
    var d = loadVoiceDraft();
    if (d) { vEl.text.value = d.text || ""; vEl.extras.checked = d.extras !== false; }
  }
  showPartial("");
  voiceStatus("", false, vEl.status);
  renderVoiceDays();
  updateGo();
  showStep("compose");
  drawMic();
  openDialog(vEl.dlg);
  if (vEl.mic.hidden || vEl.mic.disabled) vEl.text.focus(); else vEl.mic.focus();
}
function closeVoice() { closeDialog(vEl.dlg); }
vEl.dlg.addEventListener("close", function () {
  stopDictation();
  if (voice.ctl) voice.ctl.abort();
  if (tts && voice.speaking) tts.stop();
});
vEl.close.addEventListener("click", closeVoice);
bindSwipeClose(vEl.dlg, closeVoice);
byId("voice-side").addEventListener("click", function () { openVoice(); });
byId("voice-fab").addEventListener("click", function () { openVoice(); });

// ---------- Demande à Claude ----------
function planForPrompt(p) {
  return JSON.stringify({
    blocks: p.blocks.filter(function (b) { return b.keep; }).map(function (b) {
      return { title: b.title, start: fromMin(b.start), end: fromMin(b.end), type: b.type, lock: b.lock, place: b.place, note: b.note };
    }),
    tasks: p.tasks.filter(function (t) { return t.keep; }).map(function (t) { return { title: t.title }; })
  });
}
function voicePrompt(text, k, extras, prev, fix) {
  var now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes(), isToday = k === keyOf(now);
  var evs = rawEventsOn(k).map(function (e) {
    return "- " + (e.allDay ? "Journée entière" : e.start + "–" + e.end) + " " + e.title + (e.place ? " (" + e.place + ")" : "");
  });
  var tks = allTasksOn(k).filter(function (t) { return !taskDone(t, k); }).map(function (t) { return t.title; });
  var L = [];
  L.push("Tu organises l'emploi du temps d'une journée dans une application de calendrier. La personne a raconté à voix haute ce qu'elle doit faire ; transforme sa description en planning.");
  L.push("");
  L.push("Journée à organiser : " + longDay(k) + (isToday ? " (aujourd'hui)." : "."));
  if (isToday) L.push("Il est " + fromMin(nowMin) + " : ne place rien qui commence avant " + fromMin(Math.min(1425, Math.ceil((nowMin + 5) / 15) * 15)) + ", sauf une activité dont elle donne l'heure exacte.");
  L.push("Sa journée habituelle va de " + settings.workStart + " h à " + settings.workEnd + " h ; sors-en si sa description le demande (« ce soir », « je me lève à 6 h »…).");
  L.push(evs.length ? "Déjà dans le calendrier ce jour-là (à ne pas recopier, et rien par-dessus) :\n" + evs.join("\n") : "Rien n'est encore prévu ce jour-là.");
  if (tks.length) L.push("Tâches déjà notées ce jour-là (à ne pas recopier) : " + tks.join(" ; ") + ".");
  L.push("");
  L.push("Ce qu'elle a dit (transcription automatique, il peut y avoir des fautes) :");
  L.push('"""\n' + text.trim() + '\n"""');
  if (prev) {
    L.push("");
    L.push("Planning que tu lui as proposé juste avant (ce qu'elle a gardé) :");
    L.push(planForPrompt(prev));
    L.push("Elle demande cette correction :");
    L.push('"""\n' + fix.trim() + '\n"""');
    L.push("Applique la correction et renvoie le planning complet corrigé ; ne change pas le reste sans raison.");
  }
  L.push("");
  L.push("Règles :");
  L.push("1. Respecte exactement les heures qu'elle donne (« à 14 h », « de 8 h à 10 h », « midi et demi » = 12:30). « Le matin » ≈ 8:00–12:00, « l'après-midi » ≈ 14:00–18:00, « en fin d'après-midi » ≈ 17:00–19:00, « le soir » ≈ 19:00–22:00.");
  L.push("2. Sans durée donnée, estime une durée réaliste. Sans heure, place l'activité dans un créneau libre logique, en suivant l'ordre de son récit quand il compte (« puis », « ensuite », « après »).");
  L.push("3. Aucun chevauchement entre tes blocs ni avec ce qui est déjà prévu. Heures en HH:MM sur 24 h, de préférence au quart d'heure, entre 00:00 et 23:59.");
  L.push(extras
    ? "4. Ajoute un repas si la journée couvre l'heure du déjeuner ou du dîner et qu'elle n'en parle pas, et une courte pause (10 à 15 min) après environ 2 h de travail d'affilée. N'invente aucune autre activité."
    : "4. N'ajoute rien qu'elle n'a pas demandé : ni repas, ni pause, sauf si elle en parle.");
  L.push("5. Ce qui ne demande pas de créneau (un rappel rapide, « penser à… », « ne pas oublier… ») ou qui ne rentre pas dans la journée va dans \"tasks\".");
  L.push("6. Titres courts en français (40 caractères au plus), avec une majuscule, sans l'heure. \"place\" seulement si elle dit un lieu ; \"note\" seulement si c'est utile (vide sinon).");
  L.push("7. \"lock\" (mode Locker : son téléphone sera bloqué pendant le bloc pour qu'elle reste concentrée) vaut true pour les blocs où elle doit se concentrer pour apprendre ou travailler : cours, révisions, devoirs, exercices, apprentissage, lecture pour étudier, travail de fond. Il vaut false pour tout le reste : repas, temps de midi, pauses, sport, loisirs, jeux vidéo (par exemple League of Legends), séries, appels, courses, trajets, rendez-vous, tâches pratiques. Si elle dit explicitement « en Locker » ou « sans Locker », suis ce qu'elle dit.");
  L.push("8. S'il manque une information importante, fais un choix raisonnable et signale-le en une phrase courte dans \"notes\" (2 au plus).");
  L.push("");
  L.push("Réponds uniquement avec un objet JSON de cette forme :");
  L.push('{"summary":"Une phrase qui résume sa journée, en la tutoyant.","blocks":[{"title":"Cours de maths","start":"08:00","end":"10:00","type":"etudes","lock":true,"place":"","note":""}],"tasks":[{"title":"Acheter du pain"}],"notes":[]}');
  L.push("\"type\" vaut l'un de : " + Object.keys(VOICE_TYPES).join(", ") + ".");
  return L.join("\n");
}

var SAMPLE_OFF = { not_granted: 1, sampling_disabled: 1, not_declared: 1, capability_disabled: 1, capability_removed: 1 };
var SAMPLE_MSG = {
  rate_limited: "Claude est très sollicité en ce moment",
  session_expired: "ta session Claude a expiré (reconnecte-toi)",
  refused: "Claude n'a pas voulu traiter cette description",
  invalid_json: "la réponse de Claude était incomplète",
  empty_completion: "Claude n'a rien répondu"
};
function buildPlan(fix) {
  var text = vEl.text.value.trim();
  if (!text) { voiceStatus("Raconte d'abord ta journée.", true); return; }
  var k = voice.day, extras = vEl.extras.checked, prev = fix ? voice.plan : null;
  stopDictation();
  voice.prevStep = fix ? "preview" : "compose";
  vEl.thinkText.textContent = fix ? "Claude corrige ton programme…" : "Claude organise ta journée…";
  showStep("think");
  samplePromise.then(function () {
    if (!sampleFn || sampleOff) {
      if (fix) { showStep("preview"); voiceStatus("Les corrections demandent Claude. Modifie plutôt ton texte.", true, vEl.status2); return; }
      showPlan(localPlan(text, k, extras), "Organisé sur cet appareil" + (window.claude ? " (Claude n'est pas disponible ici)." : "."));
      return;
    }
    var ctl = new AbortController();
    voice.ctl = ctl;
    sampleFn.json(voicePrompt(text, k, extras, prev, fix), { modelTier: "quick", signal: ctl.signal }).then(function (raw) {
      if (voice.ctl !== ctl) return;
      voice.ctl = null;
      var p = cleanPlan(raw, k, "claude");
      if (!p.blocks.length && !p.tasks.length) throw { code: "empty_completion" };
      if (fix) vEl.fix.value = "";
      showPlan(p, "Organisé par Claude. Décoche ce que tu ne veux pas garder.");
    }).catch(function (e) {
      if (voice.ctl !== ctl) return;
      voice.ctl = null;
      var code = e && e.code;
      if (code === "cancelled") { showStep(voice.prevStep); return; }
      if (SAMPLE_OFF[code]) sampleOff = true;
      if (fix) { showStep("preview"); voiceStatus("La correction n'a pas pu être faite : " + (SAMPLE_MSG[code] || "Claude n'a pas répondu") + ".", true, vEl.status2); return; }
      var why = SAMPLE_OFF[code] ? "Claude n'est pas autorisé pour cette page" : (SAMPLE_MSG[code] || "Claude n'a pas répondu");
      showPlan(localPlan(text, k, extras), cap(why) + " : voici une proposition faite sur cet appareil." + (sampleOff ? "" : " Tu peux réessayer avec Claude."));
    });
  });
}
vEl.go.addEventListener("click", function () { buildPlan(null); });
vEl.text.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); buildPlan(null); } });
vEl.stop.addEventListener("click", function () { if (voice.ctl) voice.ctl.abort(); });
vEl.fixGo.addEventListener("click", function () {
  if (!vEl.fix.value.trim()) { vEl.fix.focus(); return; }
  buildPlan(vEl.fix.value);
});
vEl.fix.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); vEl.fixGo.click(); } });
vEl.back.addEventListener("click", function () { showStep("compose"); voiceStatus("", false, vEl.status); vEl.text.focus(); });

// ---------- Contrôle de la réponse ----------
function minOf(v) {
  var m = /^([01]?\d|2[0-4])\s*[:h]\s*([0-5]\d)?$/.exec(String(v == null ? "" : v).trim());
  if (!m) return null;
  return Math.min(1439, +m[1] * 60 + +(m[2] || 0));
}
function cleanText(v, max) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max); }
function cleanPlan(raw, k, source) {
  raw = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  var have = {};
  rawEventsOn(k).forEach(function (e) { if (!e.allDay) have[e.title.toLowerCase() + "|" + e.start] = true; });
  var blocks = [], seen = {};
  (Array.isArray(raw.blocks) ? raw.blocks : []).forEach(function (b) {
    if (!b || typeof b !== "object") return;
    var title = cleanText(b.title, 80), st = minOf(b.start), en = minOf(b.end);
    if (!title || st == null) return;
    if (en == null) en = st + settings.dur;
    if (en <= st) en = en < 360 ? 1439 : st + 30; // une fin « après minuit » s'arrête à 23:59
    en = Math.min(en, 1439);
    if (en <= st) return;
    var id = title.toLowerCase() + "|" + fromMin(st);
    if (have[id] || seen[id]) return;
    seen[id] = true;
    var type = Object.prototype.hasOwnProperty.call(VOICE_TYPES, b.type) ? b.type : "perso";
    var lock = b.lock === true || b.lock === "true" ? true : b.lock === false || b.lock === "false" ? false : LOCK_TYPES[type] === true;
    blocks.push({ title: cap(title), start: st, end: en, type: type, lock: lock, place: cleanText(b.place, 80), note: cleanText(b.note, 300), keep: true });
  });
  blocks.sort(function (a, b) { return a.start - b.start || a.end - b.end; });
  var known = {};
  allTasksOn(k).forEach(function (t) { known[t.title.toLowerCase()] = true; });
  var tasksOut = [];
  (Array.isArray(raw.tasks) ? raw.tasks : []).forEach(function (t) {
    var title = cleanText(typeof t === "string" ? t : t && t.title, 120);
    if (!title || known[title.toLowerCase()]) return;
    known[title.toLowerCase()] = true;
    tasksOut.push({ title: cap(title), keep: true });
  });
  var notes = (Array.isArray(raw.notes) ? raw.notes : []).map(function (n) { return cleanText(n, 240); }).filter(Boolean).slice(0, 3);
  return { summary: cleanText(raw.summary, 300), blocks: blocks, tasks: tasksOut, notes: notes, source: source };
}

// ---------- Aperçu ----------
// Lignes affichées : les blocs proposés et ce qui est déjà au calendrier ce jour-là, dans l'ordre.
function allRows(k) {
  var rows = voice.plan.blocks.slice();
  rawEventsOn(k).forEach(function (e) {
    if (e.allDay) return;
    rows.push({ title: e.title, start: toMin(e.start), end: endMin(e), color: colorOf(e), place: e.place, lock: e.lock, fixed: true });
  });
  return rows.sort(function (a, b) { return a.start - b.start || (a.fixed ? -1 : 1); });
}
function clashWith(b, rows) {
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r === b || (!r.fixed && !r.keep)) continue;
    if (r.start < b.end && r.end > b.start) return r;
  }
  return null;
}
function keepButton(item, label) {
  var c = el_("button", "check");
  c.type = "button";
  c.setAttribute("aria-pressed", item.keep ? "true" : "false");
  c.setAttribute("aria-label", (item.keep ? "Ne pas garder : " : "Garder : ") + label);
  c.addEventListener("click", function () { item.keep = !item.keep; renderPreview(); });
  return c;
}
function lockButton(b) {
  var btn = el_("button", "vlock");
  btn.type = "button";
  btn.setAttribute("aria-pressed", b.lock ? "true" : "false");
  btn.setAttribute("aria-label", "Locker pour « " + b.title + " » : " + (b.lock ? "activé" : "désactivé"));
  btn.title = b.lock ? "Locker activé : téléphone bloqué" : "Locker désactivé";
  btn.appendChild(svgIcon(b.lock ? "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z" : "M7 11V8a5 5 0 0 1 9.6-2M6 11h12v9H6z"));
  btn.appendChild(el_("span", null, "Locker"));
  btn.addEventListener("click", function () { b.lock = !b.lock; renderPreview(); });
  return btn;
}
function renderPreview() {
  var p = voice.plan, k = voice.day;
  vEl.sum.textContent = p.summary || cap(longDay(k));
  vEl.notes.innerHTML = "";
  p.notes.forEach(function (n) { vEl.notes.appendChild(el_("li", null, n)); });
  vEl.blocks.innerHTML = "";
  var rows = allRows(k);
  if (!rows.length) vEl.blocks.appendChild(el_("p", "hint", "Aucune activité avec un horaire."));
  rows.forEach(function (r) {
    var row = el_("div", "vp-row" + (r.fixed ? " fixed" : r.keep ? "" : " off"));
    row.style.setProperty("--c", r.fixed ? r.color : COLORS[VOICE_TYPES[r.type]]);
    if (r.fixed) {
      var lock = el_("span", "vp-lock");
      lock.appendChild(svgIcon("M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z"));
      lock.setAttribute("title", "Déjà prévu");
      row.appendChild(lock);
    } else row.appendChild(keepButton(r, r.title));
    var time = el_("span", "vp-time");
    time.appendChild(el_("b", null, fromMin(r.start)));
    time.appendChild(el_("small", null, r.end >= 1439 ? "23:59" : fromMin(r.end)));
    row.appendChild(time);
    var main = el_("span", "vp-main");
    main.appendChild(el_("b", null, r.title));
    var meta = r.fixed ? ["Déjà prévu"] : [VOICE_LABELS[r.type], fmtDur(r.end - r.start)];
    if (r.fixed && r.lock) meta.push("🔒 Locker");
    if (r.place) meta.push(r.place);
    main.appendChild(el_("small", null, meta.join(" · ")));
    if (r.note) main.appendChild(el_("small", null, r.note));
    var other = !r.fixed && r.keep ? clashWith(r, rows) : null;
    if (other) main.appendChild(el_("small", "clash", "Chevauche « " + other.title + " »"));
    row.appendChild(main);
    if (!r.fixed) row.appendChild(lockButton(r));
    vEl.blocks.appendChild(row);
  });
  vEl.tasks.innerHTML = "";
  vEl.tasksTitle.hidden = !p.tasks.length;
  p.tasks.forEach(function (t) {
    var row = el_("div", "vp-row task" + (t.keep ? "" : " off"));
    row.appendChild(keepButton(t, t.title));
    var main = el_("span", "vp-main");
    main.appendChild(el_("b", null, t.title));
    row.appendChild(main);
    vEl.tasks.appendChild(row);
  });
  var nb = p.blocks.filter(function (b) { return b.keep; }).length, nt = p.tasks.filter(function (t) { return t.keep; }).length;
  vEl.add.textContent = "Ajouter au calendrier" + (nb + nt ? " (" + (nb + nt) + ")" : "");
  vEl.add.disabled = !(nb + nt);
  vEl.fixBox.hidden = !sampleFn || sampleOff;
  drawMic();
}
function showPlan(p, sourceText) {
  voice.plan = p;
  vEl.source.textContent = sourceText;
  voiceStatus("", false, vEl.status2);
  showStep("preview");
  renderPreview();
  vEl.dlg.scrollTop = 0;
  vEl.add.focus({ preventScroll: true });
}

// ---------- Ajout au calendrier ----------
vEl.add.addEventListener("click", function () {
  var p = voice.plan, k = voice.day;
  if (!p) return;
  var bl = p.blocks.filter(function (b) { return b.keep; }), tk = p.tasks.filter(function (t) { return t.keep; });
  if (!bl.length && !tk.length) return;
  var parts = [];
  if (bl.length) parts.push(plural(bl.length, "activité", "activités"));
  if (tk.length) parts.push(plural(tk.length, "tâche", "tâches"));
  var offer = undoPoint("Journée organisée : " + parts.join(" et "));
  bl.forEach(function (b) {
    events.push(normalize({ title: b.title, date: k, start: fromMin(b.start), end: fromMin(b.end), place: b.place, notes: b.note, color: COLORS[VOICE_TYPES[b.type]], lock: b.lock }));
  });
  var now = Date.now();
  tk.forEach(function (t, i) { tasks.push(normalizeTask({ title: t.title, date: k, created: now + i })); });
  saveEvents();
  saveTasks();
  vEl.text.value = "";
  vEl.fix.value = "";
  saveVoiceDraft();
  voice.plan = null;
  closeVoice();
  state.cursor = parseKey(k);
  state.view = "day";
  render(true);
  // La grille horaire s'ouvre sur le début du programme ajouté.
  var wrap = el.view.querySelector(".tl-wrap");
  if (wrap && bl.length) wrap.scrollTop = scrollMemo = Math.max(0, (Math.min.apply(null, bl.map(function (b) { return b.start; })) - 30) * ppm());
  buzz(20);
  offer();
});

// ---------- Organisation sur l'appareil (sans Claude) ----------
// Découpe le récit en morceaux (« puis », « ensuite », virgules…), lit heures, durées et moments,
// puis range dans l'ordre du récit les activités sans heure dans les créneaux libres.
var CLK = "(?:\\d{1,2}\\s*(?:heures?|h(?![a-zà-ÿ])|:)(?:\\s*(?:\\d{2}|et demie?|et quart|moins le quart))?|midi(?:\\s+et\\s+(?:demie?|quart))?|minuit)";
var WORDNUM = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6 };
var LEADS = ["il faudrait que je", "il faudrait que j'", "il faut que je", "il faut que j'", "faut que je", "faut que j'", "il faut",
  "je voudrais", "j'aimerais", "je devrais", "je compte", "je pense", "je dois", "je vais", "je veux", "je peux", "j'aurai", "j'ai",
  "après ça", "après", "apres", "d'abord", "ensuite", "enfin", "puis", "alors", "donc", "aussi", "voilà", "bon", "euh", "et", "ok", "oui",
  "aujourd'hui", "demain", "je", "j'"];
var DUR_HINTS = [
  [/appel|t[ée]l[ée]phon|mail|message|sms/, 15], [/petit[- ]d[ée]j|caf[ée]|go[uû]ter|douche/, 20], [/sieste/, 20], [/pause/, 15], [/achat|acheter/, 30], [/\blire\b|lecture/, 45],
  [/d[ée]jeuner|d[îi]ner|manger|repas/, 45], [/course|march[ée]|poste|banque|pharmacie/, 45], [/m[ée]nage|ranger|lessive|vaisselle|cuisine/, 30],
  [/sport|salle|courir|footing|running|jogging|muscu|gym|yoga|natation|piscine|v[ée]lo|foot|basket|tennis|danse/, 60],
  [/r[ée]vis|devoir|exercice|[ée]tudi|travaill|bosser|projet|dissert|lire|lecture/, 90]
];
var TYPE_HINTS = [
  [/m[ée]decin|dentiste|docteur|kin[ée]|psy|ost[ée]o|pharmacie|sant[ée]/, "sante"], [/rdv|rendez[- ]vous|entretien/, "rdv"],
  [/\bcours\b|r[ée]vis|devoir|exercice|exam|partiel|td\b|tp\b|[ée]tudi|dissert|biblioth/, "etudes"],
  [/travail|boulot|bosser|r[ée]union|projet|mail|bureau|client/, "travail"],
  [/sport|salle|courir|footing|running|jogging|muscu|gym|yoga|natation|piscine|v[ée]lo|foot|basket|tennis|danse/, "sport"],
  [/petit[- ]d[ée]j|d[ée]jeuner|d[îi]ner|manger|repas|go[uû]ter/, "repas"], [/pause|sieste|repos/, "pause"],
  [/course|m[ée]nage|ranger|lessive|vaisselle|cuisine|poste|banque|papier|administratif/, "pratique"], [/trajet|train|bus|m[ée]tro|voiture/, "trajet"],
  [/film|s[ée]rie|jeu|jouer|lecture|lire|musique|guitare|piano|dessin/, "loisir"]
];
function hintOf(list, s, dflt) { for (var i = 0; i < list.length; i++) if (list[i][0].test(s)) return list[i][1]; return dflt; }
function readClock(t) {
  t = t.trim();
  if (/^minuit/.test(t)) return 1439;
  var m = /^midi(?:\s+et\s+(demie?|quart))?/.exec(t);
  if (m) return 720 + (m[1] ? (/demi/.test(m[1]) ? 30 : 15) : 0);
  m = /^(\d{1,2})\s*(?:heures?|h|:)\s*(\d{2}|et demie?|et quart|moins le quart)?/.exec(t);
  if (!m) return null;
  var h = +m[1], mi = 0, x = m[2] || "";
  if (/^\d/.test(x)) mi = +x; else if (/demi/.test(x)) mi = 30; else if (/quart/.test(x)) { if (/moins/.test(x)) { h -= 1; mi = 45; } else mi = 15; }
  if (h < 0 || h > 24 || mi > 59) return null;
  return Math.min(1439, h * 60 + mi);
}
function voiceClauses(text) {
  return String(text || "").replace(/[’]/g, "'").replace(/\s+/g, " ")
    .split(/[.;!?\n]+|,\s*|\s+(?:et puis|et ensuite|et après|et enfin|après ça|après quoi|puis|ensuite|enfin)\s+|\s+et\s+(?=je\s|j'|il\s+faut|faut\s|on\s|penser\s|pense\s|ne pas oublier|n'oublie|[a-zà-ÿ]{2,}(?:er|ir|re)(?:\s|$))/i)
    .map(function (s) { return (s || "").trim(); }).filter(Boolean);
}
function parseClause(raw) {
  // Deux copies du morceau : en minuscules pour la lecture, d'origine pour garder la casse du titre (« Léa »).
  var so = " " + raw.replace(/apr[eè]s[- ]midi/gi, "aprem") + " ", s = so.toLowerCase();
  if (s.length !== so.length) so = s;
  var low = s, it = { start: null, end: null, dur: null, anchor: null, kind: "block" };
  function take(re) {
    var m = re.exec(s);
    if (m) {
      s = s.slice(0, m.index) + " " + s.slice(m.index + m[0].length);
      so = so.slice(0, m.index) + " " + so.slice(m.index + m[0].length);
    }
    return m;
  }
  var m;
  if ((m = take(new RegExp("(?:\\bde\\s+|\\bentre\\s+|\\bdès\\s+)?(" + CLK + ")\\s*(?:à|a|-|–|jusqu'à|jusqu'a|et)\\s*(" + CLK + ")")))) {
    it.start = readClock(m[1]); it.end = readClock(m[2]);
  }
  if (it.end == null && (m = take(new RegExp("\\bjusqu'(?:à|a)\\s+(" + CLK + ")")))) it.end = readClock(m[1]);
  if (it.start == null && (m = take(new RegExp("(?:\\s)(?:à partir de|a partir de|à|vers|dès)\\s+(" + CLK + ")")))) it.start = readClock(m[1]);
  // Durées : « pendant 2 h », « 1 h 30 », « 45 minutes », « une demi-heure », « un quart d'heure ».
  if ((m = take(/\b(?:pendant|durant|environ|pour)?\s*(\d+|une?|deux|trois|quatre|cinq|six)\s*(?:heures?|h(?![a-zà-ÿ]))(?:\s*(\d{2})\b|\s+et\s+(demie?|quart))?/))) {
    var n = /^\d+$/.test(m[1]) ? +m[1] : WORDNUM[m[1]];
    var mins = n * 60 + (m[2] ? +m[2] : m[3] ? (/demi/.test(m[3]) ? 30 : 15) : 0);
    if (/pendant|durant|environ|pour/.test(m[0]) || n <= 4 || it.start != null) it.dur = mins;
    else it.start = Math.min(1439, mins);
  }
  if (it.dur == null && (m = take(/\b(?:pendant|durant|environ|pour)?\s*(\d+|une?|deux|trois|quatre|cinq|dix|quinze|vingt|trente|quarante-cinq|quarante)\s*min(?:utes?)?\b/))) {
    it.dur = /^\d+$/.test(m[1]) ? +m[1] : { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, dix: 10, quinze: 15, vingt: 20, trente: 30, quarante: 40, "quarante-cinq": 45 }[m[1]];
  }
  if (it.dur == null && take(/\b(?:pendant |durant |environ )?une demi[- ]heure\b/)) it.dur = 30;
  if (it.dur == null && take(/\b(?:pendant |durant |environ )?un quart d'heure\b/)) it.dur = 15;
  if (it.start == null && (m = take(new RegExp("\\b(" + CLK + ")")))) it.start = readClock(m[1]);
  // « à 3 h » dans le planning d'une journée veut dire 15 h, sauf « du matin ».
  if (it.start != null && it.start >= 60 && it.start < 420 && !/du matin|l[eè]ve|r[ée]veil/.test(low)) {
    it.start += 720;
    if (it.end != null && it.end < it.start) it.end += 720;
  }
  if (it.end != null && it.start != null && it.end <= it.start && it.end + 720 > it.start && it.end + 720 < 1440) it.end += 720;
  var PERIODS = [
    [/\b(?:en )?d[ée]but de matin[ée]e\b/, 480], [/\b(?:en )?fin de matin[ée]e\b/, 660], [/\b(?:ce |le |du |dans la |en )?matin(?:[ée]e)?\b/, 480],
    [/(?:\s)(?:le |ce |à )?midi\b/, 720], [/\b(?:en )?d[ée]but d'aprem\b/, 810], [/\b(?:en )?fin d'aprem\b/, 1020], [/\b(?:cet |l'|dans l'|en |d')?aprem\b/, 840],
    [/\b(?:avant de (?:dormir|me coucher)|avant d'aller (?:dormir|me coucher))\b/, 1320], [/\b(?:ce |le |en |dans la )?soir(?:[ée]e)?\b/, 1140]
  ];
  for (var i = 0; i < PERIODS.length; i++) if (take(PERIODS[i][0]) && it.anchor == null) it.anchor = PERIODS[i][1];
  if (it.start == null && it.anchor === 720 && /d[ée]jeuner|manger|repas/.test(low)) { it.start = 720; it.anchor = null; }
  var isTask = take(/\b(?:penser à|pense à|ne pas oublier (?:de |d')?|n'oublie pas (?:de |d')?|rappelle[- ]moi (?:de |d')?|me rappeler (?:de |d')?)/);
  // Repères de journée : « je me lève à 7 h », « je commence à 8 h », « je finis à 18 h ».
  var dayStartM = take(/\b(?:je me l[eè]ve|lever|r[ée]veil|je me r[ée]veille|je commence(?: ma journ[ée]e)?|je d[ée]marre(?: ma journ[ée]e)?|d[ée]but de (?:ma )?journ[ée]e)\b/);
  var dayEndM = !dayStartM && take(/\b(?:je (?:finis|termine|m'arr[êe]te)(?: ma journ[ée]e)?|fin de (?:ma )?journ[ée]e|je me couche|coucher)\b/);
  var t = so.replace(/\b(?:aujourd'hui|demain|ma journ[ée]e)\b/gi, " ").replace(/\s+/g, " ").trim();
  var changed = true;
  while (changed && t) {
    changed = false;
    for (var j = 0; j < LEADS.length; j++) {
      var L = LEADS[j], tl = t.toLowerCase();
      if (tl.indexOf(L) === 0 && (L.slice(-1) === "'" || tl.length === L.length || tl.charAt(L.length) === " ")) { t = t.slice(L.length).trim(); changed = true; }
    }
  }
  for (var k2 = 0; k2 < 3; k2++) t = t.replace(/(?:\s+|^)(?:à|a|de|du|des|vers|pendant|pour|le|la|les|et|ce|cet|dans|en|d'|l'|un|une|puis|avec)$/i, "").trim();
  if (dayStartM && it.start != null && t.length < 3) return { kind: "start", start: it.start + (/l[eè]ve|r[ée]veil/.test(dayStartM[0]) ? 30 : 0) };
  if (dayEndM && it.start != null && t.length < 3) return { kind: "end", start: it.start };
  if (t.length < 2) return null;
  it.title = cap(t).slice(0, 60);
  it.type = hintOf(TYPE_HINTS, low, "perso");
  if (isTask && it.start == null) it.kind = "task";
  if (it.dur == null && it.start != null && it.end != null && it.end > it.start) it.dur = it.end - it.start;
  if (it.dur == null) it.dur = hintOf(DUR_HINTS, low, settings.dur);
  return it;
}
function localPlan(text, k, extras) {
  var items = [], dayStart = null, dayEnd = null;
  voiceClauses(text).forEach(function (c) {
    var it = parseClause(c);
    if (!it) return;
    if (it.kind === "start") dayStart = it.start;
    else if (it.kind === "end") dayEnd = it.start;
    else items.push(it);
  });
  var now = new Date(), isToday = k === keyOf(now), nowMin = now.getHours() * 60 + now.getMinutes();
  var floor = isToday ? Math.ceil((nowMin + 5) / SNAP) * SNAP : 0;
  var from = Math.max(dayStart != null ? dayStart : settings.workStart * 60, floor);
  var limit = dayEnd != null ? Math.max(dayEnd, from) : 1439;
  var base = rawEventsOn(k).filter(function (e) { return !e.allDay; }).map(function (e) { return [toMin(e.start) - e.bBefore, endMin(e) + e.bAfter]; });
  var said = items.map(function (i) { return i.title.toLowerCase(); }).join(" ");
  function free(busy, s, e) { return busy.every(function (b) { return e <= b[0] || s >= b[1]; }); }
  function gap(busy, earliest, dur, until) {
    for (var m = Math.ceil(earliest / SNAP) * SNAP; m + dur <= until; m += SNAP) if (free(busy, m, m + dur)) return m;
    return null;
  }
  function run(meals) {
    var busy = base.slice(), blocks = [], tasksOut = [], notes = [];
    items.forEach(function (it) {
      if (it.kind === "task" || it.start == null) return;
      var en = it.end != null && it.end > it.start ? it.end : Math.min(1439, it.start + it.dur);
      blocks.push({ title: it.title, start: it.start, end: en, type: it.type });
      busy.push([it.start, en]);
    });
    meals.forEach(function (ml) {
      var m = gap(busy, Math.max(ml[1], floor), 45, ml[2]);
      if (m == null) return;
      blocks.push({ title: ml[0], start: m, end: m + 45, type: "repas" });
      busy.push([m, m + 45]);
    });
    var cursor = from, streak = 0, lastEnd = -1;
    items.forEach(function (it) {
      if (it.kind === "task") { tasksOut.push(it.title); return; }
      if (it.start != null) return;
      var earliest = it.anchor != null ? Math.max(it.anchor, floor) : cursor;
      var m = gap(busy, earliest, it.dur, limit);
      if (m == null && it.anchor != null) m = gap(busy, cursor, it.dur, limit);
      if (m == null) { tasksOut.push(it.title); notes.push("« " + it.title + " » ne tenait plus dans la journée : je l'ai mis dans les tâches."); return; }
      blocks.push({ title: it.title, start: m, end: m + it.dur, type: it.type });
      busy.push([m, m + it.dur]);
      streak = m === lastEnd ? streak + it.dur : it.dur;
      cursor = lastEnd = m + it.dur;
      if (extras && streak >= 120 && free(busy, cursor, cursor + 15) && cursor + 15 <= limit) {
        blocks.push({ title: "Pause", start: cursor, end: cursor + 15, type: "pause" });
        busy.push([cursor, cursor + 15]);
        cursor += 15; streak = 0; lastEnd = -1;
      }
    });
    return { blocks: blocks, tasks: tasksOut, notes: notes };
  }
  var r = run([]);
  if (extras && r.blocks.length) {
    var first = Math.min.apply(null, r.blocks.map(function (b) { return b.start; }));
    var last = Math.max.apply(null, r.blocks.map(function (b) { return b.end; }));
    var meals = [];
    if (first < 750 && last > 780 && !/d[ée]j|manger|repas|midi/.test(said)) meals.push(["Déjeuner", 720, 840]);
    if (first < 1170 && last > 1215 && !/d[îi]ner|souper|repas du soir/.test(said)) meals.push(["Dîner", 1140, 1290]);
    if (meals.length) r = run(meals);
  }
  r.blocks.sort(function (a, b) { return a.start - b.start; });
  var nb = r.blocks.length;
  var summary = nb
    ? plural(nb, "activité", "activités") + " de " + fromMin(r.blocks[0].start) + " à " + fromMin(Math.max.apply(null, r.blocks.map(function (b) { return b.end; }))) + (r.tasks.length ? ", et " + plural(r.tasks.length, "tâche", "tâches") + " sans horaire." : ".")
    : (r.tasks.length ? plural(r.tasks.length, "tâche", "tâches") + " sans horaire." : "");
  return cleanPlan({
    summary: summary,
    blocks: r.blocks.map(function (b) { return { title: b.title, start: fromMin(b.start), end: fromMin(b.end), type: b.type }; }),
    tasks: r.tasks, notes: r.notes
  }, k, "local");
}
