# E2E suites (Playwright against the web export)

    npx expo export --platform web --output-dir /tmp/wafra-web
    python3 -m http.server 8126 --directory /tmp/wafra-web &
    node scripts/e2e/e2e-smoke.mjs    # every screen: import page, paywall, trial expiry, founder unlock
    node scripts/e2e/e2e-period.mjs   # period selector correctness across screens

Both expect the app on http://localhost:8126 and chromium at
/opt/pw-browsers/chromium (set executablePath for other machines).
Native-only paths (SMS inbox scan, notification listener) cannot run on
web — cover changes to those with unit tests in scripts/test/.
