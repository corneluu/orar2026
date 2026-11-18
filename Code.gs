/* =========================================================
 * Orarul meu — REMINDERS (Telegram + Email), 5-minute time trigger
 *
 * Security model: this file is public. It holds NO secrets and exposes
 * NO web endpoint (no doGet/doPost). All secrets live in
 * Project Settings → Script Properties:
 *   GITHUB_TOKEN        fine-grained PAT, read-only "Contents" on corneluu/orar2026-data
 *   TELEGRAM_BOT_TOKEN  from @BotFather
 *   TELEGRAM_CHAT_ID    your chat id
 *   NOTIFICATION_EMAIL  one or more addresses, comma-separated
 *
 * Setup: set the properties → run `installReminderTrigger` → run `testNotify` (previews all 3 message types).
 * Sends: event reminders, morning brief at 08:00, evening report at 21:30 (Bucharest).
 * Email is sent from the Google account that owns this script (MailApp).
 * ========================================================= */

var TZ = "Europe/Bucharest";
var APP_URL = "https://corneluu.github.io/orar2026/";

function installReminderTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "checkReminders") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("checkReminders").timeBased().everyMinutes(5).create();
  checkReminders();
}

function remToMin_(t) { var p = (t || "00:00").split(":").map(Number); return p[0] * 60 + p[1]; }
function remDnum_(s) { var p = s.split("-").map(Number); return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 864e5); }
function remDow_(s) { return (remDnum_(s) + 3) % 7; } // 0 = Luni
function remWeekOf_(s) { return Math.floor((remDnum_(s) - remDow_(s)) / 7); } // week index of that Monday
function esc_(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The app syncs to data.json in a PRIVATE GitHub repo; read it with a read-only token.
var DATA_API = "https://api.github.com/repos/corneluu/orar2026-data/contents/data.json";

function loadState_() {
  var token = PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN");
  if (!token) throw new Error("Script Property GITHUB_TOKEN is not set");
  var res = UrlFetchApp.fetch(DATA_API, {
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.raw+json" },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error("Could not load data.json: HTTP " + res.getResponseCode());
  return JSON.parse(res.getContentText());
}

// Only accept plain hex colors from data before putting them into email CSS.
function color_(c) { return /^#[0-9a-f]{3,8}$/i.test(c || "") ? c : "#0284C7"; }

function notifConfig_(S) {
  var n = S.notifications || {};
  var p = PropertiesService.getScriptProperties();
  return {
    token: p.getProperty("TELEGRAM_BOT_TOKEN") || "",
    chatId: p.getProperty("TELEGRAM_CHAT_ID") || n.telegramChatId || "",
    email: p.getProperty("NOTIFICATION_EMAIL") || n.email || Session.getEffectiveUser().getEmail(),
    tg: n.notifyTelegram !== false,
    mail: n.notifyEmail !== false,
    morning: n.morningSummary !== false,
    evening: n.eveningReport !== false
  };
}


/* ---------- formatting helpers ---------- */

var ZILE = ["Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"];
var LUNI = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];
var LINE = "━━━━━━━━━━━━━━━━";

function dayLabel_(date) { var p = date.split("-").map(Number); return ZILE[remDow_(date)] + ", " + p[2] + " " + LUNI[p[1] - 1]; }
function addDays_(date, n) { var p = date.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10); }
function fmtDur_(m) { m = Math.max(0, Math.round(m)); if (m < 60) return m + " min"; var h = Math.floor(m / 60), r = m % 60; return h + " h" + (r ? " " + r + " min" : ""); }
function fmtMin_(m) { return ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2); }
function len_(o) { var d = o.e - o.s; return d > 0 ? d : 0; }

// Telegram has no colors: map the category hex to the nearest colored square.
function square_(hex) {
  var c = color_(hex).replace("#", ""); if (c.length === 3) c = c.replace(/./g, "$&$&");
  var r = parseInt(c.substr(0, 2), 16) / 255, g = parseInt(c.substr(2, 2), 16) / 255, b = parseInt(c.substr(4, 2), 16) / 255;
  var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.15) return mx > 0.6 ? "⬜" : "⬛";
  var h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
  return h < 15 || h >= 345 ? "🟥" : h < 40 ? "🟧" : h < 70 ? "🟨" : h < 170 ? "🟩" : h < 260 ? "🟦" : "🟪";
}

// Location → a button: meeting links open directly, anything else opens Google Maps.
function placeLink_(loc) {
  if (!loc) return null;
  if (/^https?:\/\/\S+$/i.test(loc.trim())) return { text: "🎥 INTRĂ ÎN MEETING", url: loc.trim() };
  return { text: "📍 NAVIGARE", url: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(loc) };
}

// Short location text for lists: meeting links become "online".
function locLabel_(loc) { return /^https?:\/\//i.test(loc.trim()) ? "🎥 online" : "📍 " + esc_(loc); }

/* ---------- senders ---------- */

var FX = { fire: "5104841245755180586", party: "5046509860389126442" }; // Telegram message effects (private chats)

function sendTelegram_(cfg, html, opt) {
  opt = opt || {};
  if (!cfg.tg || !cfg.token || !cfg.chatId) {
    console.log("Telegram skipped: enabled=" + cfg.tg + ", token=" + (cfg.token ? "set" : "MISSING") + ", chatId=" + (cfg.chatId || "MISSING"));
    return;
  }
  var body = { chat_id: cfg.chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } };
  if (opt.buttons) body.reply_markup = { inline_keyboard: opt.buttons };
  if (opt.effect) body.message_effect_id = opt.effect;
  var post = function (b) {
    return UrlFetchApp.fetch("https://api.telegram.org/bot" + cfg.token + "/sendMessage",
      { method: "post", contentType: "application/json", payload: JSON.stringify(b), muteHttpExceptions: true });
  };
  var res = post(body);
  if (res.getResponseCode() !== 200 && body.message_effect_id) { delete body.message_effect_id; res = post(body); } // effect refused → send without it
  if (res.getResponseCode() !== 200) console.error("Telegram error: " + res.getContentText());
  else console.log("Telegram sent to chat " + cfg.chatId);
}

function sendEmail_(cfg, subject, html) {
  if (!cfg.mail || !cfg.email) { console.log("Email skipped: enabled=" + cfg.mail + ", to=" + (cfg.email || "MISSING")); return; }
  try {
    MailApp.sendEmail({ to: cfg.email, subject: subject, htmlBody: html, name: "Orarul meu" });
    console.log("Email sent to " + cfg.email + " (remaining quota today: " + MailApp.getRemainingDailyQuota() + ")");
  }
  catch (err) { console.error("Email error: " + err.message); }
}

/* ---------- data ---------- */

function occurrencesOn_(S, date, withCancelled) {
  var dn = remDow_(date), res = [];
  (S.events || []).forEach(function (e) {
    if (e.rec) {
      var r = e.rec;
      if (r.days.indexOf(dn) < 0 || date < r.from || (r.until && date > r.until)) return;
      if ((remWeekOf_(date) - remWeekOf_(r.from)) % (r.every || 1) !== 0) return;
    } else if (e.date !== date) return;
    var key = e.id + "@" + date;
    var o = (S.ov && S.ov[key]) || null;
    if (o && o.cancel && !withCancelled) return;
    var m = Object.assign({}, e, o || {});
    res.push({
      key: key, title: m.title || "Fără titlu", cat: m.cat,
      start: m.start || "00:00", end: m.end || "00:00", loc: m.loc || "", note: m.note || "",
      reminder: (o && o.reminder) || e.reminder || null, cancelled: !!(o && o.cancel),
      done: !!(S.done && S.done[key]), s: remToMin_(m.start), e: remToMin_(m.end)
    });
  });
  return res.sort(function (a, b) { return a.s - b.s; });
}

function catOf_(S, id) { return (S.cats || []).filter(function (c) { return c.id === id; })[0] || { name: "General", color: "#64748B" }; }

/* ---------- email building blocks (inline styles only: email clients strip <style>) ---------- */

var F = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

function emailShell_(preheader, headBg, headHtml, bodyHtml) {
  return '<div style="display:none;max-height:0;overflow:hidden;">' + esc_(preheader) + '</div>' +
    '<div style="background:#0B0F14;padding:24px 12px;' + F + '">' +
    '<div style="max-width:560px;margin:0 auto;border-radius:20px;overflow:hidden;background:#FFFFFF;">' +
    '<div style="background:' + headBg + ';padding:28px 24px;color:#FFFFFF;">' + headHtml + '</div>' +
    '<div style="padding:24px;">' + bodyHtml + '</div>' +
    '<div style="padding:14px 24px;background:#F1F4F8;color:#64748B;font-size:12px;">Orarul meu · notificare automată</div>' +
    '</div></div>';
}

function emailButton_(text, url, dark) {
  return '<a href="' + esc_(url) + '" style="display:block;text-align:center;margin-top:12px;padding:16px;border-radius:14px;font-weight:800;font-size:16px;letter-spacing:.5px;text-decoration:none;' +
    (dark ? 'background:#0B0F14;color:#FFFFFF;' : 'background:#FFFFFF;color:#0B0F14;border:2px solid #0B0F14;') + '">' + esc_(text) + '</a>';
}

function emailRow_(S, o, status) {
  var cat = catOf_(S, o.cat);
  return '<div style="margin:0 0 8px;padding:12px 14px;border-left:6px solid ' + color_(cat.color) + ';background:#F6F8FA;border-radius:10px;">' +
    '<div style="font-size:16px;font-weight:800;color:#0B0F14;' + (o.cancelled ? 'text-decoration:line-through;' : '') + '">' + (status ? status + " " : "") + esc_(o.title) + '</div>' +
    '<div style="font-size:14px;color:#475569;margin-top:2px;"><b style="color:#0B0F14;">' + esc_(o.start) + '–' + esc_(o.end) + '</b> · ' + esc_(cat.name) +
    (o.loc ? ' · ' + locLabel_(o.loc) : '') + '</div></div>';
}

/* ---------- 1. event reminder ---------- */

function urgency_(diff) {
  if (diff <= 15) return { bg: "#DC2626", tag: "🚨🚨🚨", head: "ÎNCEPE ACUM", push: "⚡ LASĂ TOT ȘI PLEACĂ!" };
  if (diff <= 60) return { bg: "#EA580C", tag: "🔴🔴", head: "FOARTE CURÂND", push: "⏳ Pregătește-te de plecare!" };
  return { bg: "#D97706", tag: "🟠", head: "URMEAZĂ", push: "📌 Nu uita, ține-ți timpul liber." };
}

function sendReminder_(S, cfg, o, diff) {
  var cat = catOf_(S, o.cat), u = urgency_(diff), place = placeLink_(o.loc);
  var tg = u.tag + " <b>" + u.head + " — ÎN " + fmtDur_(diff).toUpperCase() + "!</b> " + u.tag + "\n" + LINE + "\n" +
    "<b>" + esc_(o.title.toUpperCase()) + "</b>\n" + LINE + "\n\n" +
    "⏰ <b>" + esc_(o.start) + " → " + esc_(o.end) + "</b>" + (len_(o) ? "  <i>(" + fmtDur_(len_(o)) + ")</i>" : "") + "\n" +
    (o.loc ? "📍 <b>" + esc_(o.loc) + "</b>\n" : "") +
    square_(cat.color) + " " + esc_(cat.name) + "\n" +
    (o.note ? "\n<blockquote>" + esc_(o.note) + "</blockquote>\n" : "") +
    "\n<b>" + u.push + "</b>";
  var buttons = [];
  if (place) buttons.push([{ text: place.text, url: place.url }]);
  buttons.push([{ text: "📅 Deschide orarul", url: APP_URL }]);
  sendTelegram_(cfg, tg, { buttons: buttons, effect: FX.fire });

  var head = '<div style="font-size:13px;font-weight:800;letter-spacing:3px;opacity:.9;">' + u.tag + ' ' + u.head + '</div>' +
    '<div style="font-size:60px;line-height:1;font-weight:900;margin:10px 0 4px;letter-spacing:-1px;">ÎN ' + esc_(fmtDur_(diff).toUpperCase()) + '</div>' +
    '<div style="font-size:16px;font-weight:700;opacity:.95;">începe la ' + esc_(o.start) + '</div>';
  var body = '<div style="height:8px;background:' + color_(cat.color) + ';border-radius:4px;margin-bottom:16px;"></div>' +
    '<div style="font-size:30px;line-height:1.15;font-weight:900;color:#0B0F14;">' + esc_(o.title) + '</div>' +
    '<div style="font-size:24px;font-weight:800;color:#0B0F14;margin:10px 0 4px;">' + esc_(o.start) + ' → ' + esc_(o.end) +
    (len_(o) ? ' <span style="font-size:15px;font-weight:600;color:#64748B;">(' + fmtDur_(len_(o)) + ')</span>' : '') + '</div>' +
    (o.loc ? '<div style="font-size:16px;color:#0B0F14;margin-top:6px;">📍 <b>' + esc_(o.loc) + '</b></div>' : '') +
    '<div style="font-size:15px;color:#475569;margin-top:6px;">' + esc_(cat.name) + '</div>' +
    (o.note ? '<div style="margin-top:14px;padding:12px 14px;background:#FFF7ED;border-left:4px solid ' + u.bg + ';border-radius:8px;font-size:15px;color:#0B0F14;white-space:pre-wrap;">' + esc_(o.note) + '</div>' : '') +
    '<div style="margin-top:18px;padding:14px;background:' + u.bg + ';color:#FFFFFF;border-radius:12px;font-weight:800;font-size:16px;text-align:center;">' + esc_(u.push) + '</div>' +
    (place ? emailButton_(place.text, place.url, true) : '') + emailButton_("📅 DESCHIDE ORARUL", APP_URL, !place);
  sendEmail_(cfg, u.tag + " ÎN " + fmtDur_(diff).toUpperCase() + ": " + o.title + " · " + o.start + (o.loc ? " · " + o.loc : ""),
    emailShell_(o.title + " începe la " + o.start, u.bg, head, body));
}

/* ---------- 2. morning brief (08:00) ---------- */

function freeGaps_(occs) {
  var gaps = [], t = 8 * 60;
  occs.forEach(function (o) { if (o.s - t >= 60) gaps.push([t, o.s]); t = Math.max(t, o.e > o.s ? o.e : o.s); });
  if (22 * 60 - t >= 60) gaps.push([t, 22 * 60]);
  return gaps;
}

function sendMorning_(S, cfg, date, minsNow) {
  var occs = occurrencesOn_(S, date), busy = occs.reduce(function (a, o) { return a + len_(o); }, 0);
  var first = occs[0], gaps = freeGaps_(occs);
  var gapTxt = gaps.map(function (g) { return fmtMin_(g[0]) + "–" + fmtMin_(g[1]); }).join(", ");
  var tg = "☀️☀️ <b>BRIEF DE DIMINEAȚĂ</b> ☀️☀️\n<b>" + dayLabel_(date).toUpperCase() + "</b>\n" + LINE + "\n";
  if (!occs.length) {
    tg += "\n🌴 <b>ZI LIBERĂ!</b> Nimic programat azi.\nOdihnește-te sau prinde din urmă ce ai amânat.";
  } else {
    tg += "📊 <b>" + occs.length + (occs.length === 1 ? " eveniment" : " evenimente") + " · " + fmtDur_(busy) + " ocupat</b>\n" +
      "🔜 Primul: <b>" + esc_(first.title) + "</b> la <b>" + esc_(first.start) + "</b>" +
      (first.s > minsNow ? " <i>(în " + fmtDur_(first.s - minsNow) + ")</i>" : "") + "\n\n" +
      occs.map(function (o) {
        var cat = catOf_(S, o.cat), rem = !o.reminder || o.reminder.enabled !== false;
        return square_(cat.color) + " <b>" + esc_(o.start) + "–" + esc_(o.end) + "</b>  " + esc_(o.title) + (o.loc ? "  · " + locLabel_(o.loc) : "") + (rem ? " 🔔" : "");
      }).join("\n") +
      (gaps.length ? "\n\n🟢 <b>Liber:</b> " + gapTxt : "") +
      "\n" + LINE + "\n💪 <b>Hai că poți! Spor azi!</b>";
  }
  sendTelegram_(cfg, tg, { buttons: [[{ text: "📅 Vezi ziua în orar", url: APP_URL }]] });

  var head = '<div style="font-size:13px;font-weight:800;letter-spacing:3px;">☀️ BRIEF DE DIMINEAȚĂ</div>' +
    '<div style="font-size:40px;line-height:1.05;font-weight:900;margin:10px 0 6px;">' + esc_(dayLabel_(date)) + '</div>' +
    '<div style="font-size:17px;font-weight:700;">' + (occs.length ? occs.length + (occs.length === 1 ? " eveniment" : " evenimente") + " · " + fmtDur_(busy) + " ocupat" : "Zi liberă 🌴") + '</div>';
  var body = occs.length
    ? '<div style="font-size:15px;color:#475569;margin-bottom:12px;">Primul: <b style="color:#0B0F14;">' + esc_(first.title) + ' la ' + esc_(first.start) + '</b></div>' +
      occs.map(function (o) { return emailRow_(S, o); }).join("") +
      (gaps.length ? '<div style="margin-top:12px;font-size:15px;color:#0B0F14;">🟢 <b>Ferestre libere:</b> ' + gapTxt + '</div>' : '')
    : '<div style="font-size:18px;color:#0B0F14;">Nimic programat azi. Bucură-te de zi! 🌴</div>';
  sendEmail_(cfg, "☀️ Brief: " + dayLabel_(date) + (occs.length ? " · " + occs.length + (occs.length === 1 ? " eveniment" : " evenimente") + ", primul la " + first.start : " · zi liberă"),
    emailShell_("Ziua ta pe scurt", "#F59E0B", head, body + emailButton_("📅 DESCHIDE ORARUL", APP_URL, true)));
}

/* ---------- 3. evening report (21:30) ---------- */

function sendEvening_(S, cfg, date, minsNow) {
  var all = occurrencesOn_(S, date, true);
  var live = all.filter(function (o) { return !o.cancelled; });
  var doneN = live.filter(function (o) { return o.done; }).length;
  var pct = live.length ? Math.round(doneN * 100 / live.length) : 0;
  var bar = ""; for (var i = 0; i < 10; i++) bar += i < Math.round(pct / 10) ? "🟩" : "⬜";
  var upcoming = function (o) { return o.e > minsNow && o.e > o.s; };
  var status = function (o) { return o.cancelled ? "🚫" : o.done ? "✅" : upcoming(o) ? "⏳" : "❌"; };
  var missed = live.filter(function (o) { return !o.done && !upcoming(o); });
  var byCat = {};
  live.forEach(function (o) { if (o.done) { var n = catOf_(S, o.cat).name; byCat[n] = (byCat[n] || 0) + len_(o); } });
  var tomorrow = addDays_(date, 1), tm = occurrencesOn_(S, tomorrow);

  var tg = "🌙 <b>RAPORT DE SEARĂ</b> 🌙\n<b>" + dayLabel_(date).toUpperCase() + "</b>\n" + LINE + "\n";
  if (!all.length) tg += "Azi nu a fost nimic programat. 😌\n";
  else {
    tg += "<b>" + doneN + "/" + live.length + " FĂCUTE · " + pct + "%</b>\n" + bar + "\n\n" +
      all.map(function (o) { return status(o) + " <b>" + esc_(o.start) + "</b>  " + (o.cancelled ? "<s>" + esc_(o.title) + "</s>" : esc_(o.title)); }).join("\n") +
      (Object.keys(byCat).length ? "\n\n⏱ <b>Timp realizat:</b> " + Object.keys(byCat).map(function (k) { return esc_(k) + " " + fmtDur_(byCat[k]); }).join(" · ") : "") +
      (missed.length ? "\n\n⚠️ <b>" + (missed.length === 1 ? "1 eveniment nemarcat" : missed.length + " nemarcate") + "</b> — bifează în orar ce ai făcut!" : "") +
      (live.length && pct === 100 ? "\n\n🏆 <b>ZI PERFECTĂ! Toate bifate!</b>" : "") + "\n";
  }
  tg += LINE + "\n📅 <b>MÂINE · " + dayLabel_(tomorrow).toUpperCase() + "</b>\n" +
    (tm.length
      ? tm.map(function (o) { return square_(catOf_(S, o.cat).color) + " <b>" + esc_(o.start) + "</b>  " + esc_(o.title) + (o.loc ? " · " + locLabel_(o.loc) : ""); }).join("\n") +
        "\n\n⏰ <b>Primul la " + esc_(tm[0].start) + " — pune alarma!</b>"
      : "🌴 Zi liberă mâine.") +
    "\n\n😴 Somn ușor!";
  var cta = missed.length ? "✅ BIFEAZĂ CE AI FĂCUT" : "📅 Deschide orarul";
  sendTelegram_(cfg, tg, { buttons: [[{ text: cta, url: APP_URL }]], effect: live.length && pct === 100 ? FX.party : null });

  var head = '<div style="font-size:13px;font-weight:800;letter-spacing:3px;">🌙 RAPORT DE SEARĂ</div>' +
    '<div style="font-size:40px;line-height:1.05;font-weight:900;margin:10px 0 6px;">' + (all.length ? pct + "% făcut" : "Zi liniștită") + '</div>' +
    '<div style="font-size:17px;font-weight:700;">' + esc_(dayLabel_(date)) + (all.length ? " · " + doneN + "/" + live.length + " bifate" : "") + '</div>' +
    (all.length ? '<div style="margin-top:14px;height:10px;background:rgba(255,255,255,.25);border-radius:5px;"><div style="width:' + pct + '%;height:10px;background:#22C55E;border-radius:5px;"></div></div>' : '');
  var body = all.map(function (o) { return emailRow_(S, o, status(o)); }).join("") +
    (missed.length ? '<div style="margin:14px 0 0;padding:14px;background:#FEF2F2;border-left:4px solid #DC2626;border-radius:8px;font-weight:800;color:#991B1B;">⚠️ ' + (missed.length === 1 ? "1 eveniment nemarcat" : missed.length + " nemarcate") + ' — bifează în orar ce ai făcut.</div>' : '') +
    '<div style="margin:22px 0 10px;font-size:13px;font-weight:800;letter-spacing:2px;color:#64748B;">MÂINE · ' + esc_(dayLabel_(tomorrow).toUpperCase()) + '</div>' +
    (tm.length ? tm.map(function (o) { return emailRow_(S, o); }).join("") : '<div style="font-size:16px;">Zi liberă mâine 🌴</div>') +
    emailButton_(missed.length ? "✅ BIFEAZĂ CE AI FĂCUT" : "📅 DESCHIDE ORARUL", APP_URL, true);
  sendEmail_(cfg, "🌙 Raport: " + (all.length ? pct + "% făcut azi (" + doneN + "/" + live.length + ")" : "zi liniștită") + (tm.length ? " · mâine primul la " + tm[0].start : ""),
    emailShell_("Cum a fost azi și ce urmează mâine", "#1E1B4B", head, body));
}

/* ---------- scheduler (time trigger, every 5 min) ---------- */

var MORNING_AT = 8 * 60, EVENING_AT = 21 * 60 + 30;

function checkReminders() {
  var S = loadState_();
  var cfg = notifConfig_(S);
  var now = new Date();
  var date = Utilities.formatDate(now, TZ, "yyyy-MM-dd");
  var minsNow = Number(Utilities.formatDate(now, TZ, "H")) * 60 + Number(Utilities.formatDate(now, TZ, "m"));

  var props = PropertiesService.getScriptProperties();
  var sent = JSON.parse(props.getProperty("sentLog") || "{}");
  var cutoff = Date.now() - 3 * 864e5;
  Object.keys(sent).forEach(function (k) { if (sent[k] < cutoff) delete sent[k]; });

  occurrencesOn_(S, date).forEach(function (o) {
    if (o.done || (o.reminder && o.reminder.enabled === false)) return;
    var remMins = (o.reminder && o.reminder.mins > 0) ? o.reminder.mins : 30;
    var diff = o.s - minsNow;
    // Fire once anywhere inside the lead window, so a late or skipped trigger run still sends.
    if (diff <= 0 || diff > remMins || sent[o.key]) return;
    sendReminder_(S, cfg, o, diff);
    sent[o.key] = Date.now();
  });

  // Each summary fires once, at the first run within the hour after its time.
  var mk = "morning_" + date, ek = "evening_" + date;
  if (cfg.morning && !sent[mk] && minsNow >= MORNING_AT && minsNow < MORNING_AT + 60) { sendMorning_(S, cfg, date, minsNow); sent[mk] = Date.now(); }
  if (cfg.evening && !sent[ek] && minsNow >= EVENING_AT && minsNow < EVENING_AT + 60) { sendEvening_(S, cfg, date, minsNow); sent[ek] = Date.now(); }

  props.setProperty("sentLog", JSON.stringify(sent));
}

/* ---------- manual preview: run in the editor ---------- */

function testNotify() {
  var S = loadState_();
  console.log("Data: " + (S.events ? S.events.length + " events" : "EMPTY / not found"));
  var cfg = notifConfig_(S), now = new Date();
  var date = Utilities.formatDate(now, TZ, "yyyy-MM-dd");
  var minsNow = Number(Utilities.formatDate(now, TZ, "H")) * 60 + Number(Utilities.formatDate(now, TZ, "m"));
  var next = occurrencesOn_(S, date).filter(function (o) { return o.s > minsNow; })[0] || occurrencesOn_(S, addDays_(date, 1))[0];
  if (next) sendReminder_(S, cfg, next, 12); // previewed as the most urgent tier
  sendMorning_(S, cfg, date, minsNow);
  sendEvening_(S, cfg, date, minsNow);
}
