# Feature 1 — New Request Flow

## Goal
A designer can create a new copy request from the dashboard, annotate 
the uploaded screenshots, generate copy, and submit for review — all 
in one continuous flow on the same page.

## Form Fields
- Request title (text input, required)
- Screenshot upload (multiple images, stored in Firebase Storage, 
  show upload progress per file, show thumbnail preview after upload)
- Annotation tool (inline, appears immediately after screenshots are uploaded)
- Feature context (textarea, required) — what the feature does and the user goal
- Tone selector (pills): Friendly, Professional, Playful, Urgent, Formal
- Locked terms (tag input)

## Flow
1. Designer fills in title
2. Uploads screenshots
3. Annotation tool appears inline in the right column — designer annotates 
   at least one element
4. Designer fills in feature context and selects tone in the left column
5. "Generate copy" button becomes enabled only after at least one annotation exists
6. Designer clicks "Generate copy" — results appear inline below the two columns
7. Designer selects preferred EN and AR option per annotation
8. Designer clicks "Save & Submit for review" — saves selections to Firestore 
   and changes status to "submitted"
9. Designer is redirected to the request detail page (read-only view)

## Behaviour
- Save as Draft → saves to Firestore with status: "draft" (no copy generated yet)
- Save & Submit for review → saves copy selections and changes status to "submitted"
- Each request stores: title, context, tone, screenshotURLs, annotations, 
  selectedCopy, status, createdBy (user ID), createdAt (timestamp)
- After submitting, redirect to request detail page in read-only mode
- Dashboard lists all requests with title, status badge, and date

## UI Layout
- Full width liquid layout — no max-width container
- Two column layout side by side:

  LEFT COLUMN (form, ~40% width):
  - Request title
  - Feature context
  - Tone selector
  - Locked terms
  - Save as draft / Save & Submit for review buttons (sticky at bottom)

  RIGHT COLUMN (screenshots + annotation, ~60% width):
  - Screenshot upload zone at the top
  - After upload, annotation canvas fills the right column
  - Large annotation workspace so screenshots are easy to draw on
  - Annotation list below the canvas showing all added annotations
  - Each annotation shows: label, type badge, existing copy, designer note

- Copy generation results appear below both columns in full width
- On mobile: stack into single column (form on top, annotation below, 
  results at the bottom)

## UI Style
- Clean minimal design using Tailwind
- Primary CTA: #FFEA00 background, #222629 text
- Secondary CTA: #F4F5F6 background, #222629 text
- Show loading states during upload, annotation save, and generation
- Mobile friendly