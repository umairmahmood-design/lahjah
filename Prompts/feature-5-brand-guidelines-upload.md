# Feature 5 — Brand Guidelines Upload

## Goal
Allow an admin to upload the company's brand guidelines document which is 
then fed as context into every Anthropic API copy generation request.

## How it works
- A "Guidelines" page accessible from the nav (admin only)
- Admin can upload a PDF or text document containing brand voice and tone guidelines
- The document is stored in Firebase Storage
- The text content is extracted and stored in Firestore under "settings/guidelines"
- Every time copy is generated, the guidelines text is fetched and injected 
  into the Anthropic API system prompt
- Admin can update the guidelines by uploading a new document (replaces the old one)
- Show the currently active guidelines document name and upload date

## Data Structure
Stored in Firestore under settings/guidelines:
- content (extracted text from the document)
- fileName (original file name)
- uploadedAt (timestamp)
- uploadedBy (user ID)

## UI
- Clean settings page with upload zone
- Show currently active guidelines with filename and date
- Upload button to replace existing guidelines
- Confirmation before replacing existing guidelines
- Loading state during upload and extraction
- Only visible to admin role
- Brand color #FFEA00 for primary actions
- Secondary actions #F4F5F6 with #222629 text
```