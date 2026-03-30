# Feature 1 — New Request Flow

## Goal
A designer can create a new copy request from the dashboard.

## Form Fields
- Request title (text input, required)
- Screenshot upload (multiple images, stored in Firebase Storage, show upload progress per file, show thumbnail preview after upload)
- Feature context (textarea, required) — what the feature does and the user goal
- Tone selector (pills or dropdown): Friendly, Professional, Playful, Urgent, Formal

## Behaviour
- Save as Draft → saves to Firestore with status: "draft"
- Submit → saves to Firestore with status: "submitted"
- Each request stores: title, context, tone, screenshotURLs, status, createdBy (user ID), createdAt (timestamp)
- After saving, redirect to dashboard
- Dashboard lists all requests with title, status badge, and date


## UI
- Clean minimal design using Tailwind
- Brand color #1B4FD8 for buttons and accents
- Show loading states during upload and save
- Mobile friendly