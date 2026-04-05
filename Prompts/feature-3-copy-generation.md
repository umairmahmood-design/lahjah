# Feature 3 — Copy Generation

## Goal
After annotating screenshots on the new request page, the designer clicks 
"Generate copy" and the app calls the Anthropic API to generate English 
and Arabic copy independently for each annotation — all inline on the 
same page.

## How it works
- "Generate copy" button is enabled only after at least one annotation exists
- Designer clicks "Generate copy" on the new request page
- App collects all annotations (label, type, designerNote, existingCopy)
- App sends to /api/generate with: annotations, feature context, tone, 
  brand guidelines, locked terms
- Anthropic API generates copy for each annotation independently
- Results appear inline below the form on the same page
- Each annotation gets 3 suggestions for both English and Arabic
- Designer clicks to select their preferred suggestion per annotation
- Designer can click "Regenerate" on any single annotation to get new suggestions
- Designer clicks "Save & Submit for review" to save selections to Firestore
  and change request status to "submitted"
- Designer is redirected to request detail page in read-only mode

## API Request
- annotations: array of { id, label, type, designerNote, existingCopy }
- context: feature context text
- tone: selected tone with its description
- guidelines: brand guidelines text from Firestore settings
- lockedTerms: array of locked terms from Firestore settings
- The AI prompt should include existing copy for revision context:
  "The current text on this element is: [existingCopy]. Please revise it."

## Copy Output Display
- Show a card per annotation
- Card header: annotation label + type badge
- Two columns: English (LTR) | Arabic (RTL, text-right, dir="rtl")
- 3 suggestions per language shown as selectable cards
- Selected suggestion highlighted with #FFEA00 background, #222629 text
- Regenerate button per annotation
- "Save & Submit for review" button at the bottom to persist selections 
  and submit the request

## Read-only View (after submission)
- On the request detail page, Designer sees their selected copy per annotation
- English and Arabic shown side by side
- No generate or edit actions — read only
- Status badge shows "Submitted for review"
- If status is "changes_requested", show Copy Team revision notes in a 
  highlighted box and allow designer to update selections and resubmit

## Loading State
- Show a loading skeleton while generating
- Disable the "Generate copy" button while loading
- Show a progress message: "Generating copy for X annotations..."

## UI
- Clean minimal design using Tailwind
- Primary CTA: #FFEA00 background, #222629 text
- Secondary actions: #F4F5F6 background, #222629 text
- Selected copy card: #FFEA00 background, #222629 text
- Arabic always RTL with dir="rtl" and text-right
- Mobile friendly