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

- [x] Unique applicationId: app.wafra.android (versionCode 1 in app.json)
- [x] Signed releases: keystore/wafra-upload.jks (upload key; CI signs both
      APK and AAB — replaceable in Play Console if ever compromised)
      - CI reads the key from repo secrets; nothing about it is committed:

        | secret | required | meaning |
        | --- | --- | --- |
        | `WAFRA_KEYSTORE_B64` | yes | `base64 -w0 wafra-upload.jks` |
        | `WAFRA_KEYSTORE_PASSWORD` | yes | store password |
        | `WAFRA_KEY_PASSWORD` | no | key password (defaults to the store one) |
        | `WAFRA_KEY_ALIAS` | no | key alias (defaults to `wafra`) |

      - They reach Gradle as `ORG_GRADLE_PROJECT_*` properties, so no
        password is written into build.gradle or any workspace file.
      - With no keystore secret the build still succeeds, signed with a
        throwaway key on a random per-run password. Those artifacts cannot
        update a side-loaded install and cannot be uploaded to Play.
      - The build fails early, with a message naming the secret at fault, if
        the keystore does not open or lacks the alias.
- [x] Play **AAB** built by CI as the wafra-aab artifact every push
- [x] Privacy policy written (landing page section; host on real domain)
- [x] i18n: English + Arabic UI with RTL; auto-detected, Settings override
- [ ] Final app icon + adaptive icon + splash pass
- [ ] Screenshots (phone, 1080×1920+) + feature graphic 1024×500
- [ ] Content rating questionnaire (PEGI 3 expected)
- [ ] Countries + pricing (UAE first; SA pack ready when expanding)
- [ ] YOUR STEPS: Play developer account ($25), upload wafra-aab to a
      closed test track, paste the SMS declaration, add privacy policy URL,
      create the two Pro subscription SKUs (3-day free trial on each)

## Monetization — Wafra Pro

- Model: 3-day free trial, then subscription required. Trial = everything
  unlocked from first launch. After trial, SMS/notification importing
  pauses until subscribed (viewing existing data and manual entry keep
  working). Salary-day months and backup/restore are Pro-gated too.
- Configure the same 3-day free trial on the Play subscription offers so
  the store purchase button reads "3 days free".
- SKUs (create in Play Console → Monetize → Subscriptions):
  `wafra_pro_monthly` (AED 9.99/mo), `wafra_pro_yearly` (AED 74.99/yr).
- Code: paywall at `src/app/pro.tsx`; entitlement `state.pro`; billing
  abstraction `src/lib/purchases.ts` — swap its stubs for react-native-iap
  at submission (requestSubscription/getAvailablePurchases). UI unchanged.
- Play policy: digital subscriptions MUST use Play Billing (15% fee under
  $1M/yr after joining the small-business program). Include manage/cancel
  link (Play handles it), and price in AED via Play Console pricing.
- Side-load builds: billing is unavailable by design (Play Billing only
  works when installed from Play); founder unlock = 7 taps on the Settings
  logo toggles Pro locally.

## Roadmap notes borrowed from FinArt parity

- Bank-app **notification listener** as a second capture channel (banks moving
  off SMS to push notifications).
- Email parsing channel (optional, Gmail API) — later.
- Salary-day month start (custom month boundary) — cheap, high-value in UAE.
- Multi-currency auto-conversion to AED (fixes USD-only subscription SMS gap).
