# 06 — UI/UX Handoff

Purpose: let the UI/UX phase (Track U) proceed without breaking the logic, and give the designer/agent everything known about today's screens, problems and constraints. Logic contracts live in `03-target-architecture.md`; findings in `02-audit-findings.md` (UX-*, A11Y-*).

**Method note:** this was derived from reading code and CSS, not from viewing rendered pages or signing in, so visual judgements (spacing, contrast, feel) still need a screen review on real devices.

## 1. The rule of the split

UI work may change **markup, styles, layout, copy, component structure, animation and information architecture**. UI work may **not** change: Firestore schema, security rules, Function contracts, the appointment state machine, availability logic, role logic. If a design needs new data or a new action, request it as a logic task (add to `04-backlog.md`), do not improvise it in a component.

## 2. Architecture that makes redesign safe

Target layers (see `03 §2.2`):

```
ui/         presentational components; no Firebase imports; props in, events out
features/   screen containers: call hooks, pass props to ui/ components
hooks/      useAvailability, useBooking, useAppointments(day), usePatientSearch, useAuthClaims …
services/   the ONLY modules importing firebase/firestore or firebase/functions
lib/        ist.js, format.js, phone.js, errors.js (maps error.reason → friendly copy)
```

Every screen container returns one of a small set of explicit states: `loading | empty | error | ready` (plus `success` for forms). Views must render all of them. Hooks expose `{ data, status, error, actions }`.

Until Phase 0/1 refactors land, pages still mix UI and Firestore. The Track U agent should start after `P0-02/03` and the service/hook extraction, or extract as it goes without changing behaviour.

## 3. State checklist (apply to every screen and list)

For each screen record and implement: **loading** (skeleton, not a spinner-only page), **empty** (say what to do next), **error** (human message + retry; never developer text), **offline/slow**, **success/confirmation**, **disabled with reason**, **permission denied** (wrong role: explain and offer the right entry), **session expired** (return to login with context), **partial data**.

## 4. Screen inventory

Legend: E = exists today, N = new (needs design), Role = who sees it. Data/actions refer to the service layer in `03`.

### 4.1 Public site (`<clinicdomain>`)

| Screen | Route | Status | Purpose and key content | Data / actions | Notes |
|---|---|---|---|---|---|
| Home | `/` | E | Trust + fast path to booking: doctor, services, hours/today status ("Open until 10:00"), location, phone, reviews/credentials | `clinic/profile`, schedule summary | Replace stock photos with real ones; one `<h1>`; no auto-rotating hero (or pausable) |
| About / Doctor | `/about` | E | Bio, qualifications (MBBS/MD/DNB/DM), registration HR886, philosophy | `doctors/{id}` | Hours must come from config |
| Services / Conditions | `/services` | N | Conditions treated, procedures (endoscopy, colonoscopy…), what to expect | static content | Client to supply copy |
| Fees & FAQs | `/faq` (or section) | N | Consultation fee, payment modes, what to bring, cancellation policy, emergency note | config | Only if client agrees to publish fees |
| Contact | `/contact` | E | Address, phone, WhatsApp, email, map, hours, parking/landmark | `clinic/profile` | Phone missing today |
| Booking | `/book` (old `/Booknow`) | E | Step flow: date/time → details → review + consent → success | `getAvailability`, `createBooking` | See §5.1 |
| Booking success / manage | `/booking/:reference` | N | Confirmation, add to calendar, directions, cancel/reschedule | `lookupBooking`, `cancelAppointment`, `rescheduleAppointment` | Guest access by reference+phone |
| Login / Sign up | `/login` | E | Patient auth, email verification, reset | Firebase Auth | Show/hide password, strength hint |
| Patient portal | `/patient` | E | Upcoming/past appointments, profile, patient-reported info, clinic documents/prescriptions (later) | `useAppointments`, patient services | Separate "you entered" from "clinic recorded" |
| Patient account | `/patient/account` | E | Name, password, linked patients (family) | | |
| Privacy / Terms | `/privacy`, `/terms` | N | Policies, data-request contact | static | Versioned |
| 404 | `*` | N | Helpful not-found with links | | Today unknown URLs redirect to Home |

### 4.2 Staff site (`staff.<clinicdomain>`)

| Screen | Role | Status | Purpose | Key states and actions |
|---|---|---|---|---|
| Staff login | all staff | E | Sign in, MFA prompt, reset | Wrong role → clear message |
| Reception – Today | receptionist, admin | E (rebuild) | Run the day: queue with tokens, statuses, quick actions (confirm, check in, cancel with reason, mark no-show), walk-in button, search, next-up | Bounded to today; live updates; legal actions only |
| Reception – Patient search/registry | receptionist, admin, doctor | N | Find by phone/name, create patient, patient card with appointment history | Duplicate hints |
| Reception – Book on behalf | receptionist, admin | N | Same booking steps as public but staff-styled and faster | `createStaffAppointment` |
| Reception – Day sheet / print | receptionist | N | Printable list for the day | Print stylesheet |
| Doctor – Today | doctor | E (rebuild) | Ordered patient list, call next / start / complete, patient summary drawer | Only legal transitions |
| Doctor – Calendar & hours | doctor | E | Week view, weekly hours, exceptions list (add/edit/delete), close-day preview | Monday-based weeks |
| Doctor – Consultation | doctor | N (P2) | Visit note, vitals, diagnosis, advice, prescription builder, follow-up | Autosave, lock, print |
| Admin – Overview | admin | E (rebuild) | Today snapshot, alerts (failed notifications, unconfirmed), shortcuts | |
| Admin – Staff | admin | E | Invite, role, disable, reset, MFA status | Guards visible in UI |
| Admin – Reports | admin | N (P2) | Volume, no-shows, cancellations, revenue | Date range, export |
| Admin – Settings | admin | N | Clinic profile, hours defaults, slot length, cutoffs, reminders, templates | |
| Admin – Audit log | admin | N | Filterable audit trail | Read-only |
| Billing | reception, admin | N (P2) | Invoice, payment, receipt print, day-close | |
| My account | all staff | E | Name, password, MFA | |

Shared shell: top bar with clinic name, role badge, today's date (IST), notifications, account menu; primary nav per role (see §7); global search (patient) for reception/doctor.

## 5. Flow specifications

### 5.1 Public booking (highest-value flow, optimise first)

1. **Choose time:** next 14 days horizontally scrollable, today preselected if open; sessions grouped "Morning 08:00–10:00 / Evening 17:00–18:30"; each slot shows only its start time; booked slots hidden or clearly disabled with a text reason; "Next available" shortcut; loading skeleton.
2. **Your details:** name, mobile (validated, +91 default, numeric keypad), age or DOB, sex, email (optional), new vs follow-up, reason (optional, helper "Do not include sensitive details you'd rather share in person"), preferred language later.
3. **Review and consent:** summary card (doctor, date, time, clinic address), consent text (versioned), link to privacy notice, one primary button.
4. **Success:** reference (large, copyable), add to calendar (.ics), directions, "cancel or reschedule" link, what to bring, phone number, and an SMS/WhatsApp confirmation notice when P1-NOTIFY lands.
5. **Failure recoveries:** slot taken → keep entered details, show the next free slots; network error → retry without losing data; rate limited → friendly wait message.

### 5.2 Reception day flow (speed matters)

Landing = **Today**. Big touch targets (used on desktop and tablet), keyboard shortcuts (`/` search, `N` new walk-in, `Enter` to advance the focused row), status chips with colour + icon + text (never colour alone), one-click primary action per row that follows the state machine (Confirm → Check in → …), destructive actions require a reason dialog, undo toast where legal. Waiting list shows waiting time. Empty day state suggests "Add walk-in".

### 5.3 Doctor day flow

Next patient card with demographics, reason, previous visit summary; "Start consultation" → visit screen (P2) → "Complete". Calendar is secondary. Never show cancelled items in counts.

### 5.4 Patient portal

Hierarchy: next appointment (with cancel/reschedule) → history → documents/prescriptions (when available) → profile/family. Clearly label **"Information you added"** vs **"From the clinic"**.

## 6. Design system

### 6.1 Current tokens (extracted from `index.css`)

- **Font:** Manrope (400–800) loaded through CSS `@import` from Google Fonts; fallbacks Inter/system.
- **Brand blues (inconsistent):** `#176dcc` (primary buttons/links, 35 uses), `#1471cc`, `#0f5bad` (hover), `#2780df` (focus ring), `#173f76` and `#143b70`/`#19395f`/`#29496e` (headings/dark text), `#61728b` (muted text), `#4d8cc6` and `#126bca` (Tailwind pages, `bb` colour in config).
- **Surfaces:** `#f7fbff` app background, `#fff` cards, borders `#dce8f5`/`#dbe8f5`/`#cddded`/`#e5eef7`, light fills `#eef6ff`/`#edf6ff`/`#edf2f7`.
- Radius ~0.55–1.1rem; soft blue shadows (`rgba(22,63,112,.09)`).
- Dark mode: configured in Tailwind (`darkMode:'class'`), **not implemented**.

### 6.2 Problems to fix

- Two styling systems (hand-written 42 KB `index.css` and Tailwind utilities) with no shared tokens; several near-identical blues.
- Dead CSS for removed screens (`01 §7`); `!important` overrides for input colours/autofill; class names are screen-specific, not reusable components.
- Logo is a CSS crop hack (`.brand-logo__crop`) around a PNG; needs a proper SVG/PNG lockup with a mobile variant.
- Desktop-first `max-width` breakpoints only; staff screens are usable on tablet but not designed for it.
- Focus styles only on a few inputs; no `:focus-visible` system; no reduced-motion handling.

### 6.3 Target system (recommendation)

- Tokens as CSS variables in `styles/tokens.css` (colour, type scale, spacing, radius, elevation, motion, z-index) and mapped into `tailwind.config.js`. One brand primary, one accent, semantic colours (success/warning/danger/info) each with AA-contrast text/background pairs, status colours for the appointment states.
- Typeface: keep Manrope (or another humanist sans), **self-hosted**, `font-display: swap`, tabular numerals for times/tokens/money.
- Components in `src/ui/` (headless primitives such as Radix UI are acceptable; keep bundle small): Button, IconButton, Field (label+hint+error), Input, Select, Textarea, Checkbox/Radio, DatePicker/DayStrip, SlotGrid, Card, Badge/StatusBadge, Tabs, Dialog/ConfirmDialog (reason), Drawer, Table/DataList, Toast, Skeleton, EmptyState, ErrorState, Banner, Stepper, Avatar, PageHeader, Shell (public/staff).
- Motion: subtle (150–250 ms), respect `prefers-reduced-motion`; no auto-advancing carousels.
- Iconography: one consistent set (e.g. Lucide); status uses icon + text + colour.
- Optional dark mode for staff (long screen time) — decide in `07` D-12; if not, remove the unused `darkMode` config.

### 6.4 Design principles for this clinic

- **Trust first:** real photos, credentials visible, clear contact details, calm palette, no stock-photo gloss, no aggressive banners.
- **Older patients and low-bandwidth mobile users:** ≥ 16 px body text, large tap targets (≥ 44 px), high contrast, short forms, plain language, works on 3G, no layout shift.
- **Reception is a power-user context:** density, speed, keyboard, predictable positions, no modals for routine steps.
- **Never blame the user;** every error says what happened and what to do.
- **Privacy in the UI:** avoid showing full phone/reason in shared-screen contexts unless needed; mask patient names on the public queue display if one is ever added.
- **Language:** English now; design for Hindi/Punjabi (text expansion, script fonts) if D-09 says yes.

## 7. Information architecture

**Public nav:** Home · About · Services · Contact · Book appointment (primary button) · Sign in (secondary). Footer: address, phone, hours, links to privacy/terms; **remove "Staff access" from the public footer** (staff use their bookmarked domain).

**Staff nav (by role):**
- Reception: Today · Search patients · Book · Day sheet · (Billing)
- Doctor: Today · Calendar · Patients · (Visits)
- Admin: Overview · Staff · Reports · Settings · Audit log

## 8. Accessibility requirements (WCAG 2.2 AA target)

- Semantic landmarks, one `<h1>` per page, logical heading order; skip-to-content link.
- All inputs have visible labels; errors linked with `aria-describedby`; focus moves to the first error / success message; `aria-live="polite"` for async results.
- Day/slot pickers: `aria-pressed` or radiogroup semantics; disabled slots include text such as "Booked".
- Carousel: none, or pause/stop control and no auto-advance under reduced motion.
- Mobile menu: focus trap, Esc closes, returns focus to trigger; body scroll lock via class.
- Visible `:focus-visible` on every interactive element; contrast ≥ 4.5:1 text, 3:1 UI; do not rely on colour alone (status = text + icon).
- Touch targets ≥ 44×44 px; content reflows at 320 px; supports 200% zoom.
- Test with keyboard only, VoiceOver/TalkBack spot-check, axe/Lighthouse in CI (`P3-A11Y`).

## 9. Responsive and performance targets

- Mobile-first CSS; breakpoints ≈ 360 / 768 / 1024 / 1440. Public site is mobile-first (most patients); staff site is desktop/tablet-first but must be usable on a phone for the doctor.
- Public pages: LCP ≤ 2.5 s on mid-range mobile, CLS < 0.1, JS for the home page ≤ ~150 KB gzip; images responsive WebP/AVIF with dimensions; fonts self-hosted; hero image ≤ 150 KB.
- No layout jump when availability loads (skeletons of final height).

## 10. Content needs from the client

Real clinic photos (exterior, waiting area, doctor), logo files (vector), phone/WhatsApp/email, fee schedule (if publishable), services/conditions list, FAQs, hours and holidays, credentials text, reviews policy, languages, emergency instructions, parking/landmark, procedure prep instructions (gastro), letterhead for prescriptions.

## 11. Acceptance criteria for Track U

- Every screen in §4 exists with all §3 states designed and implemented.
- All components live in `src/ui`, use tokens only (no raw hex in feature code), and are documented (short usage notes or a `/dev/ui` gallery route excluded from production).
- No Firestore/Function imports in `ui/` or view components.
- Lighthouse (mobile) ≥ 90 performance/accessibility/best-practices/SEO on Home, About, Contact, Book; axe: 0 serious/critical violations.
- Visual regression baselines (optional) for booking and reception Today.
- Data contracts and rules are unchanged from `03` (verified by the existing test suite passing untouched).
