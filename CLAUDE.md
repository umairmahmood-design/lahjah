# Lahjah — AI Copy Generation & Review Platform

## Product Overview
Lahjah is a web app that helps product and design teams generate on-brand UI copy in both English and Arabic. Designers upload feature screenshots, annotate the specific UI elements that need copy, provide feature context, and the app generates brand-aligned copy using the Anthropic API.

## Tech Stack
- **Frontend + Backend**: Next.js 14 with App Router and TypeScript
- **Styling**: Tailwind CSS (primary brand color: #1B4FD8)
- **Database**: Firebase Firestore
- **File Storage**: Firebase Storage
- **Auth**: Firebase Auth (email/password — Google OAuth pending OKTA approval)
- **AI**: Anthropic API (claude-sonnet-4-20250514)
- **Hosting**: Vercel (auto-deploys on GitHub push)

## Auth Flow
1. `/login` — email/password sign-in, with toggle to create account mode
2. Create account: email + password + confirm password → creates Firebase Auth user + Firestore profile → redirect to `/onboarding`
3. Sign in: email + password → check Firestore → if `onboardingCompleted` true → `/dashboard`, else → `/onboarding`
4. `/onboarding` — role selection (Designer or Copy Team); saves role to Firestore, then redirects to `/dashboard`
5. `AuthGuard` — checks auth state AND `onboardingCompleted`; redirects unauthenticated users to `/login` and users without completed onboarding to `/onboarding`

Firestore `users/{uid}` document shape:
```
{ uid, email, role, createdAt, onboardingCompleted: true }
```

## User Roles
- **Designer**: Creates copy requests, uploads screenshots, generates copy, submits for review
- **Copy Team**: Reviews submitted requests, approves or requests revisions

## Phase 1 Features (Build in this order)
1. **New request flow** — title, screenshot upload (multiple), feature context input, tone selector, save to Firestore
2. **Annotation tool** — draw boxes on uploaded screenshots to identify specific UI copy elements, label each annotation by type (CTA, Heading, Error Message, Tooltip, Body)
3. **Copy generation** — generate English and Arabic copy independently per annotation using Anthropic API, show 3 suggestions per string, allow regeneration
4. **Tone selector + locked terms** — predefined tones pulled from brand guidelines, locked terms the AI must never alter
5. **Brand guidelines upload** — upload a document that is fed as context into every generation request
6. **Review + revision flow** — designer submits request to Copy Team, Copy Team can approve or request changes, designer gets notified and can resubmit
7. **Version history** — every generation and revision round is saved and viewable
8. **Copy/paste export** — EN and AR copy shown side by side, easy copy per string or full request

## Design Conventions
- Brand color: #1B4FD8 (blue)
- Font: System default via Tailwind
- Keep UI clean, minimal, and professional
- Arabic copy must be displayed RTL (right-to-left)
- English and Arabic always shown side by side

## Project Structure
```
app/
  page.tsx              # Landing page
  layout.tsx            # Root layout
  login/page.tsx        # Login page
  dashboard/
    page.tsx            # Request list dashboard
    new/page.tsx        # New request creation
  api/
    generate/route.ts   # Anthropic copy generation API
lib/
  firebase.ts           # Firebase client config
components/
  AuthGuard.tsx         # Route protection
  DashboardNav.tsx      # Navigation
```

## Important Rules for Claude Code
- Always use TypeScript
- Always use Tailwind for styling — no inline styles
- Store all data in Firestore, files in Firebase Storage
- API keys are in .env.local — never hardcode them
- Arabic text must always have dir="rtl" and text-right alignment
- After every feature, run npm run build to check for errors before committing
- Commit and push to GitHub after each completed feature
