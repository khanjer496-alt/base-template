# Wafra — Google Play release playbook

Modeled on FinArt ("Expense Tracker Budget Planner", com.finart — live on Play
with READ_SMS since 2016, 1M+ downloads), which ships under Google's
**"SMS-based money management"** permission exception for "apps that track and
manage budget" (Play policy: Use of SMS or Call Log permission groups).

## Why we qualify

- SMS-based expense tracking IS the core functionality, not a side feature.
- The permission is **optional**: the app fully works with manual entry if the
  user taps "Not now" (this must stay true — never gate the app on the grant).
- Nothing leaves the device. No servers, no account, no analytics on spending.
  This exceeds FinArt's "private mode" (their opt-in is our only mode).
- Prominent disclosure before the runtime prompt (onboarding explainer step).

## Permissions Declaration Form — draft answer

> Wafra is a personal expense tracker and budget planner. Its core feature is
> automatic expense tracking from bank transaction alert SMS: UAE banks send an
> SMS for every card transaction, transfer, statement and bill. Wafra reads
> these messages on-device to log transactions, track credit-card due dates and
> detect recurring subscriptions. Processing is 100% local: messages are never
> transmitted off the device; the app has no server component and no user
> accounts. Non-transactional messages are ignored and never stored. The
> permission is optional — the app functions with manual entry when declined.
> Requested permissions: READ_SMS (inbox scan of historical bank alerts).

Attach a short screen-recording of: onboarding disclosure → permission prompt →
scan → transactions appearing.

## Data safety form

- Data collected: none. Data shared: none. All data stored on-device only.
- Financial info is processed ephemerally on-device; optional backup is an
  encrypted file the user exports themselves.
- Security practices: data not transmitted; user can request deletion by
  clearing app data (Settings → Erase data).

## Store listing (draft)

**Title:** Wafra: Expense Tracker UAE
**Short description:** Automatic expense tracker for UAE banks. SMS-based, private, AED-first.

**Full description outline** (mirror FinArt's structure):
- Expense tracker: automatic from bank SMS, no spreadsheets, no bank logins.
- Knows every card: limits, outstanding, statement due dates with reminders.
- Subscriptions: detects recurring charges, price rises, stopped services.
- Budgets, insights in plain language, net-worth trend, monthly report.
- Made for the UAE: AED-first, DEWA/Etisalat/du understood, 16 UAE banks.
- **Data privacy & security controls** section (the compliance argument):
  - No registration — no email, no phone number, no account.
  - Everything on your phone. No servers involved, ever.
  - Optional app lock (fingerprint).
  - Backup is a file you own and control.
  - Does not connect to bank accounts; works from SMS alerts only.
- "Why Wafra needs SMS permission?" paragraph, verbatim style from FinArt:
  optional, only for automatic tracking, banks send SMS for every transaction.

## Build checklist before submission

- [ ] Unique applicationId (e.g. app.wafra.android) — currently template id
- [ ] versionCode/versionName scheme wired to CI
- [ ] Signed **AAB** (Play requires AAB, not APK) with an upload key
- [ ] Release shrinking/proguard pass; strip debug flags
- [ ] Final app icon + adaptive icon + splash
- [ ] Privacy policy URL (add page to landing site; required field)
- [ ] Screenshots (phone, 1080×1920+) + feature graphic 1024×500
- [ ] Content rating questionnaire (PEGI 3 expected)
- [ ] Countries: start UAE-only if desired

## Roadmap notes borrowed from FinArt parity

- Bank-app **notification listener** as a second capture channel (banks moving
  off SMS to push notifications).
- Email parsing channel (optional, Gmail API) — later.
- Salary-day month start (custom month boundary) — cheap, high-value in UAE.
- Multi-currency auto-conversion to AED (fixes USD-only subscription SMS gap).
