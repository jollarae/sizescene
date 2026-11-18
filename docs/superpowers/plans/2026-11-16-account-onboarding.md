# Account Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each shopper create an email/password account once, save measurements to that account, and remain signed in on later opens.

**Architecture:** Keep the extension's plain JavaScript and Supabase REST setup. `auth.js` owns sessions and password login; `profile.js` owns the user measurements API; the popup routes by session/profile state, and the measurement page edits the same profile. The hosted database migration already defines per-user RLS.

**Tech Stack:** Chrome Manifest V3, JavaScript, Supabase Auth and PostgREST, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-16-account-onboarding-design.md`

## Global Constraints

- Account first; no creator measurements as defaults for new users.
- For initial testing, disable Supabase email confirmation; do not offer password recovery without an email sender.
- Keep password out of extension storage. Keep AI secret on the server.
- Do not open paid AI access to all accounts until server-side usage controls are in place.

## Review Focus

- Existing owner session/profile: preserve the signed-in account and migrate its local measurements only with account match.
- Switched account: never reuse the previous account's measurements.
- Expired access token: renew with refresh token without demanding another login.
- Offline save/load: show retry and do not claim cloud save succeeded.
- Missing hosted table: show a setup error rather than silently storing locally.

---

### Task 1: Password auth and persistent session

**Files:** Modify `auth.js`, `auth-ui.js`, `ai-config.js`; test `tests/auth.test.cjs`.

**Interfaces:** `signUp(email, password, options)`, `signIn(email, password, options)`, `getAccessToken(options)`, `signOut(options)`.

- [ ] Add failing tests for signup, login, refresh across opens, and signout.
- [ ] Run `node --test tests/auth.test.cjs` and see expected failures.
- [ ] Implement password endpoints and stored-session renewal; remove owner-only client gate.
- [ ] Run auth tests and entire suite.

### Task 2: Per-account measurements

**Files:** Create `profile.js`; modify `measurements.js`, `measurements.html`; test `tests/profile.test.cjs`.

**Interfaces:** `SizeSceneProfile.load(options)`, `.save(measurements, options)`, `.clearCache(options)`.

- [ ] Add failing tests for per-user load/save, account switch, missing table and network errors.
- [ ] Run `node --test tests/profile.test.cjs` and see expected failures.
- [ ] Implement API and measurement editor; remove personal defaults.
- [ ] Run profile tests and entire suite.

### Task 3: Popup routing and onboarding views

**Files:** Modify `popup.html`, `popup.js`, `popup.css`; create `onboarding.js`; test `tests/onboarding.test.cjs`.

**Interfaces:** Signed-out user sees create/login; signed-in user without profile sees form; signed-in user with profile scans.

- [ ] Add failing browser tests for first open, signup, returning session, and account switch.
- [ ] Run `node --test tests/onboarding.test.cjs` and see expected failures.
- [ ] Implement editorial onboarding views and route before scanning.
- [ ] Run browser tests and entire suite.

### Task 4: Release boundary and setup notes

**Files:** Modify `README.md`, `supabase/functions/analyze-listing/index.ts`, `tests/analyze-listing.test.cjs` as required.

- [ ] Verify the hosted migration and account settings if access is available; otherwise document exact dashboard steps.
- [ ] Keep the current AI test account restriction until server-side usage limits are ready, and explain that new shoppers can use local scanning meanwhile.
- [ ] Run the entire test suite and inspect the extension in Chrome.
