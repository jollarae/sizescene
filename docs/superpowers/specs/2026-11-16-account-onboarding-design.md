# SizeScene account onboarding

## Intent

Make SizeScene usable by people besides its creator. A shopper creates an account or signs in once, enters body measurements once, and sees personalized recommendations on later product scans without reentering those measurements. The existing editorial popup design remains the visual starting point.

## User experience

1. On first open, show a welcome view with **Create account** and **Log in**. Both use email and password.
2. For this initial test version, turn off email confirmation in Supabase so new accounts can start immediately without an email sender. The extension should tell users that password reset is not yet available. Email confirmation and password reset are required before a wider release.
3. After sign-in, if the account has no complete profile, open the measurement form. Require height, weight, waist, and hip; inseam and thigh remain optional. Offer kilograms and pounds for weight. Start with empty fields for every new account.
4. Save measurements to the signed-in account. Keep the login session in extension storage and automatically renew its short-lived access token. On later opens, retrieve that account's measurements and scan the active product page without another login. Ask for login again only after sign-out, session revocation, or loss of local session data; retrieve the same saved measurements after login.
5. The three-dot menu opens account and measurement settings. A user can edit their measurements and sign out. Signing out clears the local session and cached profile so another person on the same browser cannot see the previous user's measurements.
6. If saving or loading fails, keep the form data visible and show a clear retry message. Never fall back to the creator's measurements or claim a personalized recommendation without a saved profile.

## Data and access

- Use the existing Supabase project, Supabase Auth for email/password accounts, and `public.user_measurements` for profile storage. Confirm that the table migration is present in the hosted project before relying on it.
- Keep Row Level Security enabled so each signed-in user can read and change only their own row. Store the user's password only through Supabase Auth; never save it in the extension.
- A local cache may make repeat opens quick, but it must be scoped to the account and replaced by the server profile when available. Cloud storage is what makes measurements survive extension reinstall or a new device.
- Remove the hard-coded Berkeley email restriction in the extension and AI Edge Function. Before opening the paid AI feature to new accounts, add server-side per-user usage limits and monitoring. Keep the OpenAI secret on the server.
- Configure a production email sender for signup confirmation and password reset before inviting users whose addresses are not project team members.

## Approaches

- **Chosen: account first.** A shopper signs up or logs in before saving measurements or scanning. This gives one clear path and prevents anonymous or mixed-account profiles.
- **Considered: browse first.** A shopper could explore before signing in, then register to save. This adds guest-state transitions and is outside this version.

## Scope and checks

This phase covers account creation, login, logout, per-account measurement storage, returning-user restore, and account-first popup routing. It does not expand recommendations beyond jeans. Verify new-account, returning-account, expired-session, sign-out/account-switch, and failed-network flows. Do not release broadly until account email delivery, password reset, and AI usage controls are working.
