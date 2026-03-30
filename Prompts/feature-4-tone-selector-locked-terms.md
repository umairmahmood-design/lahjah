# Feature 4 — Tone Selector & Locked Terms

## Goal
Give designers and the copy team control over the tone of generated copy, 
and allow admins to define locked terms that the AI must never alter or 
mistranslate.

## Tone Selector
- Tones are already selectable in the new request form (Feature 1)
- In this feature, tones should be properly fed into the Anthropic API prompt
- Each tone should have a description that is passed as context to the AI:
  - Friendly → warm, approachable, conversational
  - Professional → clear, confident, formal but not cold
  - Playful → fun, light-hearted, uses wordplay where appropriate
  - Urgent → direct, action-oriented, creates a sense of urgency
  - Formal → respectful, traditional, suitable for official communications
- The selected tone should be clearly visible on the request detail page

## Locked Terms
- A dedicated "Locked Terms" settings page accessible from the nav
- Only admin users can add, edit, or delete locked terms
- Each locked term has:
  - English term (e.g. "HungerStation")
  - Arabic equivalent (e.g. "هنقرستيشن")
  - Note (optional, e.g. "Always use this exact spelling")
- Locked terms are stored in Firestore under a "settings/lockedTerms" document
- Locked terms are fetched and injected into every Anthropic API call as part 
  of the system prompt: "Never alter these terms: ..."
- UI shows a simple table of all locked terms with add/edit/delete actions

## Admin Role
- Add a role field to the Firebase user (stored in Firestore under users/{uid})
- Roles: "designer" | "copy_team" | "admin"
- Only admin role can see and access the Locked Terms settings page
- For now, manually set a user as admin directly in Firestore

## UI
- Locked Terms page: clean table with Add Term button
- Add/edit via a simple modal with English, Arabic, and Note fields
- Brand color #1B4FD8 for buttons
- Mobile friendly