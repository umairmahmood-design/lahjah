# Feature 3 — Copy Generation

## Goal
When a designer clicks "Generate copy" on a request detail page, the app calls 
the Anthropic API and generates English and Arabic copy independently for each 
annotation in the request.

## How it works
- Designer clicks "Generate copy" button on the request detail page
- App collects all annotations from the request (label, type, designer's note)
- App sends to /api/generate with: annotations, feature context, tone, brand guidelines
- Anthropic API generates copy for each annotation
- Results are displayed on the page in a clean two-column layout (EN | AR)
- Each annotation gets 3 suggestions for both English and Arabic
- Designer can click to select their preferred suggestion per annotation
- Designer can click "Regenerate" on any single annotation to get new suggestions
- Selected copy is saved to Firestore against the annotation

## API Request
- annotations: array of { id, label, type, designerNote, existingCopy }
- The AI prompt should include the existing copy so it knows what to revise:
  "The current text on this element is: [existingCopy]. Please revise it."

## Copy Output Display
- Show a card per annotation
- Card header: annotation label + type badge
- Two columns: English (LTR) | Arabic (RTL, text-right, dir="rtl")
- 3 suggestions per language shown as selectable pills or cards
- Selected suggestion highlighted in brand blue (#1B4FD8)
- Regenerate button per annotation
- "Save selections" button to persist to Firestore

## Loading State
- Show a loading skeleton while generating
- Disable the Generate button while loading
- Show a progress message: "Generating copy for X annotations..."

## UI
- Clean minimal design using Tailwind
- Brand color #1B4FD8
- Arabic always RTL
- Mobile friendly
```



