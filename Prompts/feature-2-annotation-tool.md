# Feature 2 — Annotation Tool

## Goal
After creating a request, a designer can open each uploaded screenshot and draw 
boxes around specific UI elements that need copy. Each annotation becomes a 
copy slot that the AI will generate copy for in Feature 3.

## How it works
- From the request detail page, designer clicks on a screenshot to open it
- A canvas/drawing mode is activated on top of the screenshot
- Designer draws a rectangle by clicking and dragging over a UI element
- After drawing, a small popup appears asking for:
  - Annotation label (what is this element called e.g. "Main CTA", "Error message")
  - Annotation type (dropdown): CTA, Heading, Error Message, Tooltip, Body Copy
  - Annotation (open inputfield): Allowing designer to write their need. e.g. revise the english and provide the translation of the annotated labels and types.
- The annotation is saved with a colored border and label visible on the screenshot
- Designer can add multiple annotations per screenshot
- Designer can delete an annotation by clicking on it and pressing delete
- All annotations are saved to the request in Firestore
- Once the first screenshot is uploaded and annotated activate the Generate copy button and provide the required copy upon pressing the generate copy button.
- Existing copy (text input): the current text on the UI element 
  e.g. "Continue" for a button, "Going the distance, just for you" for a heading


## Data Structure
Each annotation stores:
- id (unique)
- screenshotURL (which screenshot it belongs to)
- label (designer's name for it e.g. "Main CTA button")
- type (CTA / Heading / Error Message / Tooltip / Body Copy)
- coordinates (x, y, width, height as percentages for responsiveness)

## UI
- Clean toolbar above the screenshot with: Draw mode toggle, Delete button
- Annotations shown as colored rectangles with labels
- Different colors per annotation type:
  - CTA → blue (#1B4FD8)
  - Heading → purple
  - Error Message → red
  - Tooltip → yellow
  - Body Copy → green
- Mobile friendly
- Save annotations button to persist to Firestore
```

