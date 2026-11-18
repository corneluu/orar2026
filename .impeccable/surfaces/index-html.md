---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: []
---

# Surface: Orarul meu — phone UI (index.html)

Mode: Operate. Build path: code-led. Primary device: Samsung Galaxy S25 (~360x780 CSS px); must hold at 320px and keep desktop working.

## Confirmed answers (2026-11-18, 32-question interview)
Today: next-event hero card; agenda = today + 7 days grouped by day; ended events dimmed and collapsed ("Terminate (n)"); live now-indicator everywhere (progress on running event, time line in day grid).
Nav: bottom tab bar Azi · Săpt · Lună · Setări; add = floating round button; header = date/month title + search only; all settings (notifications, theme, GitHub sync, categories) in one Setări tab.
Week = 7 stacked day rows with full-name event pills. Month = grid with category dots, tap a day shows its list under the grid; no week numbers on phone. Day hour-grid opened by tapping a day header, not a tab.
Editor: full-height bottom sheet, Save pinned at the bottom; all field groups visible (title+category, start/end, repeat, location/notes/reminder); times picked with in-app scroll wheels; editing one occurrence of a series asks "Doar azi" / "Toată seria".
Tap event = details sheet (Edit, Done, Cancel today, smart location button). Swipe right = done, swipe left = cancel today with undo, swipe between days/weeks/months, long-press = quick menu (duplicate, move, delete). Subtle haptics (navigator.vibrate). Location: link → "Intră în meeting", address → "Navigare" (Google Maps).
Look: follow system light/dark with override; calm & clean but not plain; no emoji clutter (line icons), no glow/gradients, no tiny text; comfortable ~64px rows; category = left color bar + light tint; reminder shown as small bell + "2h"; default reminder ON 30 min; filters behind a filter button with badge; empty day = "Zi liberă" + add action; motion short (~200ms), off under reduced motion; installable PWA (manifest + icon).

## Direction contract
THESIS: A pocket timetable that answers "what's next" before you touch it. It refuses the category default of a shrunken desktop month grid on a phone.
OWN-WORLD: Restrained: cool neutral ground (paper-grey light, deep slate-ink dark), one accent, and the category colours doing the real work as 4px left bars over an 8–12% tint. Type: system UI stack (One UI/Roboto on Android) with tabular figures; times are the typographic voice, set large and tabular. 1.5px-stroke line icons, 12–16px radii, hairline separators, no shadows except sheets/FAB.
STORY: Open → instantly see the running or next event, how long until it, where. Scroll → rest of today, then the week ahead. Thumb → add, mark done, cancel today, without leaving the list.
FIRST VIEWPORT (360x780): header 56px ("Azi" title + "Miercuri, 18 noiembrie" subline, search icon right). Next card ~150px: kicker "URMEAZĂ · în 42 min" / "ACUM · mai sunt 18 min", title 22px, time range in large tabular numerals, location button, progress bar while running. Then today's remaining rows (time column 52px + title/place), "Terminate (2)" fold, then "Mâine · Joi 19". FAB 56px bottom-right above a 64px tab bar + safe-area.
FORM: Calm native-grade agenda (user-pinned via interview; overrides the roll). Signature interaction: swipe-to-done/cancel rows with colour reveal + undo snackbar, and the next-card countdown ticking each minute.
seed: none (unavailable)
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
