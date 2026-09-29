const fs = require('fs');
const path = require('path');

// 1. Resolve Bucharest Date & Time
function getBucharestTime() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  const parts = formatter.formatToParts(new Date());
  const get = t => parts.find(p => p.type === t).value;
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
  const h = Number(get('hour')), m = Number(get('minute'));
  return { dateStr, timeStr: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`, minsNow: h * 60 + m, hour: h, minute: m };
}

// 2. Data math helpers
const toMin = t => { const [a, b] = (t || '00:00').split(':').map(Number); return a * 60 + b; };
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dnum = s => { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
const dow = s => (dnum(s) + 3) % 7; // 0 = Luni
const mondayOf = s => { const d = parse(s); d.setDate(d.getDate() - dow(s)); return d.toISOString().slice(0, 10); };
const weekOf = s => Math.floor(dnum(mondayOf(s)) / 7);

// 3. Load database and settings
const dataPath = path.join(__dirname, '..', 'data.json');
if (!fs.existsSync(dataPath)) {
  console.log('data.json not found, exiting.');
  process.exit(0);
}

let S = {};
try {
  S = JSON.parse(fs.readFileSync(dataPath, 'utf-8')) || {};
} catch (e) {
  console.error('Error reading data.json:', e);
  process.exit(1);
}

const notifSettings = S.notifications || {};

// Target notification credentials & parameters
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || notifSettings.telegramBotToken || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || notifSettings.telegramChatId || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || notifSettings.resendApiKey || '';
const TARGET_EMAIL = process.env.NOTIFICATION_EMAIL || notifSettings.email || 'mcornel1178@gmail.com';
const USER_PHONE = notifSettings.phone || '0771569557';
const TEST_MODE = process.env.TEST_MODE === 'true';

const enableTelegram = notifSettings.notifyTelegram !== false;
const enableEmail = notifSettings.notifyEmail !== false;
const reminderOffsets = Array.isArray(notifSettings.timing) && notifSettings.timing.length > 0 
  ? notifSettings.timing 
  : [15, 30]; // default 15 and 30 minutes before
const enableMorningSummary = notifSettings.morningSummary !== false;

const now = getBucharestTime();
console.log(`Current time in Bucharest: ${now.dateStr} ${now.timeStr} (${now.minsNow} mins)`);
console.log(`Configured Email: ${TARGET_EMAIL}, Phone: ${USER_PHONE}`);
console.log(`Telegram Bot Token: ${TELEGRAM_TOKEN ? 'Present (***)' : 'Missing'}, Chat ID: ${TELEGRAM_CHAT_ID ? TELEGRAM_CHAT_ID : 'Missing'}`);
console.log(`Resend API Key: ${RESEND_API_KEY ? 'Present (***)' : 'Missing'}`);

// 4. Sent reminders state tracking
const logPath = path.join(__dirname, '..', '.reminders_log.json');
let sentLog = {};
if (fs.existsSync(logPath)) {
  try { sentLog = JSON.parse(fs.readFileSync(logPath, 'utf-8')); } catch (e) {}
}

// Cleanup old log entries older than 3 days
const cutoff = Date.now() - (3 * 864e5);
for (const k of Object.keys(sentLog)) {
  if (sentLog[k] < cutoff) delete sentLog[k];
}

// 5. Compute occurrences for today
function mkOcc(e, date) {
  const key = e.id + '@' + date;
  const o = S.ov ? S.ov[key] : null;
  if (o && o.cancel) return null;
  const m = o ? { ...e, ...o } : e;
  return {
    id: e.id,
    key,
    date,
    title: m.title || 'Fără titlu',
    cat: m.cat,
    start: m.start || '00:00',
    end: m.end || '00:00',
    note: m.note || '',
    loc: m.loc || '',
    reminder: m.reminder || null,
    done: !!(S.done && S.done[key]),
    s: toMin(m.start),
    e: toMin(m.end)
  };
}

function getTodayOccurrences(date) {
  const res = [];
  const dn = dow(date);
  for (const e of (S.events || [])) {
    let occ = null;
    if (!e.rec) {
      if (e.date === date) occ = mkOcc(e, date);
    } else {
      const r = e.rec;
      if (!r.days.includes(dn) || date < r.from || (r.until && date > r.until)) continue;
      if ((weekOf(date) - weekOf(r.from)) % (r.every || 1) !== 0) continue;
      occ = mkOcc(e, date);
    }
    if (occ) res.push(occ);
  }
  res.sort((a, b) => a.s - b.s);
  return res;
}

const todayOccs = getTodayOccurrences(now.dateStr);
console.log(`Total events planned for today (${now.dateStr}): ${todayOccs.length}`);

const catOf = id => (S.cats || []).find(c => c.id === id) || { name: 'General', color: '#0284C7' };

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 6. Senders
async function sendTelegram(htmlContent) {
  if (!enableTelegram) {
    console.log('Telegram reminders disabled in settings.');
    return false;
  }
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('Telegram credentials not configured. Skipping Telegram notification.');
    return false;
  }
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: htmlContent,
        parse_mode: 'HTML'
      })
    });
    const result = await res.json();
    if (!result.ok) throw new Error(result.description);
    console.log('✓ Telegram reminder sent successfully!');
    return true;
  } catch (err) {
    console.error('Error sending Telegram:', err.message);
    return false;
  }
}

async function sendEmail(subject, htmlContent) {
  if (!enableEmail) {
    console.log('Email reminders disabled in settings.');
    return false;
  }
  if (!TARGET_EMAIL) return false;
  
  if (RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Orarul meu <onboarding@resend.dev>',
          to: [TARGET_EMAIL],
          subject: subject,
          html: htmlContent
        })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(result));
      console.log(`✓ Email sent to ${TARGET_EMAIL} successfully!`);
      return true;
    } catch (err) {
      console.error('Error sending Email via Resend:', err.message);
    }
  } else {
    console.log(`Email to ${TARGET_EMAIL} skipped: RESEND_API_KEY not provided.`);
  }
  return false;
}

// 7. Main runner
async function run() {
  let anySent = false;

  // TEST MODE handler
  if (TEST_MODE) {
    console.log('🚀 Running in TEST_MODE: sending test notifications now...');
    const testTg = `🚀 <b>Test Notificare Orar</b>\n\n` +
      `Salut! Sistemul de notificări automate funcționează perfect.\n` +
      `• <b>Oră curentă:</b> ${now.timeStr} (${now.dateStr})\n` +
      `• <b>Destinatar Email:</b> ${escapeHtml(TARGET_EMAIL)}\n` +
      `• <b>Telefon:</b> ${escapeHtml(USER_PHONE)}\n\n` +
      `🔗 <a href="https://corneluu.github.io/orar2026/">Deschide Orarul Meu</a>`;

    const testEmailHtml = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:540px;margin:0 auto;padding:24px;border:1px solid #E2E8F0;border-radius:16px;background:#ffffff;">
        <div style="height:6px;width:100%;background:#0284C7;border-radius:3px;margin-bottom:18px;"></div>
        <h2 style="margin:0 0 10px;color:#0F172A;font-size:22px;">🚀 Test Notificări Orar</h2>
        <p style="font-size:15px;color:#475569;margin:0 0 16px;">Acesta este un mesaj de test. Sistemul tău de alertă prin Email și Telegram este activ și pregătit!</p>
        <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px;margin-bottom:20px;font-size:14.5px;line-height:1.6;">
          <div>🕒 <b>Data & Ora:</b> ${now.dateStr} ${now.timeStr}</div>
          <div>✉️ <b>Email setat:</b> ${escapeHtml(TARGET_EMAIL)}</div>
          <div>📱 <b>Telefon setat:</b> ${escapeHtml(USER_PHONE)}</div>
        </div>
        <a href="https://corneluu.github.io/orar2026/" style="display:inline-block;background:#0284C7;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14.5px;">Deschide Orarul Meu →</a>
      </div>
    `;

    await sendTelegram(testTg);
    await sendEmail('🚀 Test Notificare Orarul Meu', testEmailHtml);
    return;
  }

  // Check upcoming events using per-event reminder settings
  for (const occ of todayOccs) {
    if (occ.done) continue;

    // Get the base event to read its reminder config
    const baseEv = (S.events || []).find(e => e.id === occ.id);
    // Check if override has reminder config too
    const ovData = S.ov ? S.ov[occ.key] : null;
    const remConfig = (ovData && ovData.reminder) || (baseEv && baseEv.reminder) || null;

    // Per-event reminder enabled? Default true if no config exists (backwards compat)
    const remEnabled = remConfig ? remConfig.enabled !== false : true;
    if (!remEnabled) {
      console.log(`Reminder disabled for event: ${occ.title}`);
      continue;
    }

    // Per-event custom offset in minutes (default 30 if not set)
    const remMins = (remConfig && remConfig.mins && remConfig.mins > 0) ? remConfig.mins : 30;

    const diff = occ.s - now.minsNow;

    // Trigger window: ±7 minutes around target offset
    const windowMin = Math.max(1, remMins - 7);
    const windowMax = remMins + 7;

    if (diff >= windowMin && diff <= windowMax) {
      const reminderId = `${occ.key}_remind_${now.dateStr}`;
      if (sentLog[reminderId]) {
        console.log(`Reminder already sent for: ${occ.title} (${occ.start})`);
        continue;
      }


      const cat = catOf(occ.cat);
      console.log(`🔔 Sending reminder for: ${occ.title} at ${occ.start} (in ~${diff} min, offset: ${remMins}min)`);

      const tgMsg = `⏰ <b>REMINDER: ${escapeHtml(occ.title)}</b>\n\n` +
        `📁 <b>Categorie:</b> ${escapeHtml(cat.name)}\n` +
        `🕒 <b>Ora:</b> ${escapeHtml(occ.start)} – ${escapeHtml(occ.end)} <i>(în ~${diff} minute)</i>\n` +
        (occ.loc ? `📍 <b>Locație:</b> ${escapeHtml(occ.loc)}\n` : '') +
        (occ.note ? `📝 <b>Notițe:</b> ${escapeHtml(occ.note)}\n` : '') +
        `\n🔗 <a href="https://corneluu.github.io/orar2026/">Deschide orarul</a>`;

      const emailHtml = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:540px;margin:0 auto;padding:24px;border:1px solid #E2E8F0;border-radius:16px;background:#ffffff;">
            <div style="height:6px;width:100%;background:${cat.color};border-radius:3px;margin-bottom:18px;"></div>
            <h2 style="margin:0 0 10px;color:#0F172A;font-size:22px;">⏰ Reminder: ${escapeHtml(occ.title)}</h2>
            <p style="font-size:15px;color:#475569;margin:0 0 16px;">Evenimentul tău începe în aproximativ <b>${diff} minute</b>!</p>
            <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px;margin-bottom:20px;font-size:14.5px;line-height:1.6;">
              <div>📁 <b>Categorie:</b> <span style="color:${cat.color};font-weight:700;">${escapeHtml(cat.name)}</span></div>
              <div>🕒 <b>Ora:</b> ${escapeHtml(occ.start)} – ${escapeHtml(occ.end)}</div>
              ${occ.loc ? `<div>📍 <b>Locație:</b> ${escapeHtml(occ.loc)}</div>` : ''}
              ${occ.note ? `<div>📝 <b>Notițe:</b> ${escapeHtml(occ.note)}</div>` : ''}
            </div>
            <a href="https://corneluu.github.io/orar2026/" style="display:inline-block;background:#0284C7;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14.5px;">Deschide Orarul Meu →</a>
          </div>
        `;

      await sendTelegram(tgMsg);
      await sendEmail(`⏰ Reminder: ${occ.title} la ${occ.start}`, emailHtml);

      sentLog[reminderId] = Date.now();
      anySent = true;
    }
  }

  // 8. Morning Summary (Around 07:45 - 08:20)
  if (enableMorningSummary && now.hour === 8 && now.minute <= 20) {
    const summaryKey = `morning_summary_${now.dateStr}`;
    if (!sentLog[summaryKey] && todayOccs.length > 0) {
      console.log('Sending morning summary...');
      const listItemsTg = todayOccs.map(o => `• <b>${escapeHtml(o.start)} - ${escapeHtml(o.end)}</b> — ${escapeHtml(o.title)} (${escapeHtml(catOf(o.cat).name)}) ${o.loc ? `[📍 ${escapeHtml(o.loc)}]` : ''}`).join('\n');
      const tgSummary = `🌅 <b>Bună dimineața! Orarul tău pentru azi (${now.dateStr}):</b>\n\n` +
        listItemsTg + `\n\n🔗 <a href="https://corneluu.github.io/orar2026/">Vezi tot orarul</a>`;
      
      const emailSummary = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:540px;margin:0 auto;padding:24px;border:1px solid #E2E8F0;border-radius:16px;background:#ffffff;">
          <h2 style="margin:0 0 10px;color:#0F172A;">🌅 Orarul tău pentru azi (${now.dateStr})</h2>
          <p style="color:#475569;">Iată activitățile programate pentru astăzi:</p>
          <ul style="line-height:1.8;color:#0F172A;font-size:15px;">
            ${todayOccs.map(o => `<li><b>${escapeHtml(o.start)} - ${escapeHtml(o.end)}</b>: ${escapeHtml(o.title)} <span style="color:#64748B;">(${escapeHtml(catOf(o.cat).name)})</span> ${o.loc ? `— <i>${escapeHtml(o.loc)}</i>` : ''}</li>`).join('')}
          </ul>
          <a href="https://corneluu.github.io/orar2026/" style="display:inline-block;background:#0284C7;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14.5px;margin-top:10px;">Deschide Orarul Meu →</a>
        </div>
      `;

      await sendTelegram(tgSummary);
      await sendEmail(`🌅 Orarul tău pentru azi (${now.dateStr})`, emailSummary);

      sentLog[summaryKey] = Date.now();
      anySent = true;
    }
  }

  // Save updated sent log if any reminder was sent
  if (anySent) {
    fs.writeFileSync(logPath, JSON.stringify(sentLog, null, 2));
    console.log('Updated reminders log saved.');
  }
  console.log('Reminders check finished successfully.');
}

run().catch(console.error);
