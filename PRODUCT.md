# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person (the owner) managing his own week: university, gym sessions, pizzeria shifts, work for his father, personal plans. Used mostly on his phone (Samsung Galaxy S25, ~360×780 CSS px), on the go, often between activities. Must also work on every phone width down to 320px, and on desktop.

## Product Purpose

A personal schedule ("Orarul meu") that answers three jobs, in this order of importance on the phone:
1. Check today / what's next — at a glance, where to be and when.
2. Plan the week — see and adjust recurring shifts and sessions.
3. Add events fast — create an event or a one-off change on the go.
Month overview is secondary. Success: opening the app answers "what's next" without any tap, and adding an event takes seconds.

## Operating Context

- Opened many times a day for a quick glance; sessions are short.
- Events are mostly recurring weekly (gym splits, shifts), with per-date overrides (move, cancel, mark done).
- Reminders arrive on Telegram + email from a Google Apps Script backend; the app holds per-event reminder settings.
- Syncs across devices through a private GitHub repo; works offline from localStorage.
- UI language: Romanian.

## Capabilities and Constraints

- Single static file (`index.html`), no build step, hosted on GitHub Pages; vanilla JS with a tiny `h()` DOM helper. Keep it that way.
- Views: month, week, day; phone start view should be a today/agenda view (confirmed 2026-11-18).
- Features to preserve: categories with colors and filters, recurring events (days, every N weeks, from/until), per-date overrides and cancel, done state, per-event reminders, notifications settings, theme (light/dark + palette), swipe navigation, GitHub sync status.
- CSP restricts network to api.github.com and api.telegram.org; fonts from Google Fonts only.
- Secrets never enter synced data (see README security model).

## Product Principles

1. "What's next" first: the phone opens on now, not on a grid.
2. Thumb-first: primary actions reachable one-handed at the bottom of the screen.
3. Readable at 320px: no truncated event names where a list can show them in full.
4. Recurring is the norm: editing a series vs. one date must be obvious and safe.
5. Offline and private by default.

## Accessibility & Inclusion

Touch targets at least 44px; text legible outdoors (strong contrast in both themes); respects reduced motion.
