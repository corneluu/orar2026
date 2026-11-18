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
 * Setup: set the properties → run `installReminderTrigger` → run `testNotify`.
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
    morning: n.morningSummary !== false
  };
}

function sendTelegram_(cfg, html) {
  if (!cfg.tg || !cfg.token || !cfg.chatId) {
    console.log("Telegram skipped: enabled=" + cfg.tg + ", token=" + (cfg.token ? "set" : "MISSING") + ", chatId=" + (cfg.chatId || "MISSING"));
    return;
  }
  var res = UrlFetchApp.fetch("https://api.telegram.org/bot" + cfg.token + "/sendMessage", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ chat_id: cfg.chatId, text: html, parse_mode: "HTML" }),
    muteHttpExceptions: true
  });
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

function occurrencesOn_(S, date) {
  var dn = remDow_(date), res = [];
  (S.events || []).forEach(function (e) {
    if (e.rec) {
      var r = e.rec;
      if (r.days.indexOf(dn) < 0 || date < r.from || (r.until && date > r.until)) return;
      if ((remWeekOf_(date) - remWeekOf_(r.from)) % (r.every || 1) !== 0) return;
    } else if (e.date !== date) return;
    var key = e.id + "@" + date;
    var o = (S.ov && S.ov[key]) || null;
    if (o && o.cancel) return;
    var m = Object.assign({}, e, o || {});
    res.push({
      key: key, title: m.title || "Fără titlu", cat: m.cat,
      start: m.start || "00:00", end: m.end || "00:00", loc: m.loc || "", note: m.note || "",
      reminder: (o && o.reminder) || e.reminder || null,
      done: !!(S.done && S.done[key]), s: remToMin_(m.start)
    });
  });
  return res.sort(function (a, b) { return a.s - b.s; });
}

function card_(color, title, intro, rows) {
  return '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:540px;margin:0 auto;padding:24px;border:1px solid #E2E8F0;border-radius:16px;background:#fff;">' +
    '<div style="height:6px;background:' + color_(color) + ';border-radius:3px;margin-bottom:18px;"></div>' +
    '<h2 style="margin:0 0 10px;color:#0F172A;font-size:22px;">' + title + '</h2>' +
    '<p style="font-size:15px;color:#475569;margin:0 0 16px;">' + intro + '</p>' +
    '<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px;margin-bottom:20px;font-size:14.5px;line-height:1.6;">' + rows + '</div>' +
    '<a href="' + APP_URL + '" style="display:inline-block;background:#0284C7;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;">Deschide Orarul Meu →</a></div>';
}

function checkReminders() {
  var S = loadState_();
  var cfg = notifConfig_(S);
  var now = new Date();
  var date = Utilities.formatDate(now, TZ, "yyyy-MM-dd");
  var hour = Number(Utilities.formatDate(now, TZ, "H"));
  var minsNow = hour * 60 + Number(Utilities.formatDate(now, TZ, "m"));

  var props = PropertiesService.getScriptProperties();
  var sent = JSON.parse(props.getProperty("sentLog") || "{}");
  var cutoff = Date.now() - 3 * 864e5;
  Object.keys(sent).forEach(function (k) { if (sent[k] < cutoff) delete sent[k]; });

  var catOf = function (id) { return (S.cats || []).filter(function (c) { return c.id === id; })[0] || { name: "General", color: "#0284C7" }; };
  var occs = occurrencesOn_(S, date);

  occs.forEach(function (o) {
    if (o.done || (o.reminder && o.reminder.enabled === false)) return;
    var remMins = (o.reminder && o.reminder.mins > 0) ? o.reminder.mins : 30;
    var diff = o.s - minsNow;
    // Fire once anywhere inside the lead window, so a late or skipped trigger run still sends.
    if (diff <= 0 || diff > remMins || sent[o.key]) return;
    var cat = catOf(o.cat);
    sendTelegram_(cfg, "⏰ <b>REMINDER: " + esc_(o.title) + "</b>\n\n" +
      "📁 <b>Categorie:</b> " + esc_(cat.name) + "\n" +
      "🕒 <b>Ora:</b> " + esc_(o.start) + " – " + esc_(o.end) + " <i>(în ~" + diff + " minute)</i>\n" +
      (o.loc ? "📍 <b>Locație:</b> " + esc_(o.loc) + "\n" : "") +
      (o.note ? "📝 <b>Notițe:</b> " + esc_(o.note) + "\n" : "") +
      '\n🔗 <a href="' + APP_URL + '">Deschide orarul</a>');
    sendEmail_(cfg, "⏰ Reminder: " + o.title + " la " + o.start, card_(cat.color,
      "⏰ Reminder: " + esc_(o.title), "Evenimentul tău începe în aproximativ <b>" + diff + " minute</b>!",
      "<div>📁 <b>Categorie:</b> " + esc_(cat.name) + "</div><div>🕒 <b>Ora:</b> " + esc_(o.start) + " – " + esc_(o.end) + "</div>" +
      (o.loc ? "<div>📍 <b>Locație:</b> " + esc_(o.loc) + "</div>" : "") +
      (o.note ? "<div>📝 <b>Notițe:</b> " + esc_(o.note) + "</div>" : "")));
    sent[o.key] = Date.now();
  });

  var mk = "morning_" + date;
  if (cfg.morning && hour === 8 && !sent[mk] && occs.length) {
    var line = function (o) { return esc_(o.start) + " – " + esc_(o.end) + " — " + esc_(o.title) + " (" + esc_(catOf(o.cat).name) + ")" + (o.loc ? " 📍 " + esc_(o.loc) : ""); };
    sendTelegram_(cfg, "🌅 <b>Bună dimineața! Orarul tău pentru azi (" + date + "):</b>\n\n" +
      occs.map(function (o) { return "• " + line(o); }).join("\n") + '\n\n🔗 <a href="' + APP_URL + '">Vezi tot orarul</a>');
    sendEmail_(cfg, "🌅 Orarul tău pentru azi (" + date + ")", card_("#0284C7",
      "🌅 Orarul tău pentru azi (" + date + ")", "Iată activitățile programate pentru astăzi:",
      occs.map(function (o) { return "<div>• " + line(o) + "</div>"; }).join("")));
    sent[mk] = Date.now();
  }

  props.setProperty("sentLog", JSON.stringify(sent));
}

function testNotify() {
  var S = loadState_();
  console.log("Sheet data: " + (S.events ? S.events.length + " events" : "EMPTY / not found") + ", notifications in app settings: " + (S.notifications ? "yes" : "no"));
  var cfg = notifConfig_(S);
  var when = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm");
  sendTelegram_(cfg, "🚀 <b>Test Notificare Orar</b>\n\nRemindere din Google Apps Script active (" + when + ").");
  sendEmail_(cfg, "🚀 Test Notificare Orarul Meu", card_("#0284C7", "🚀 Test Notificări Orar",
    "Remindere din Google Apps Script active.", "<div>🕒 " + when + "</div><div>✉️ " + esc_(cfg.email) + "</div>"));
}
