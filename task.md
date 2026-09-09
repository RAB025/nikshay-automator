# Batch Processing Implementation

- [ ] Update `popup.html` with Batch Progress UI and action buttons
- [ ] Update `popup.js` to handle batch state management, storage, and CSV generation
- [ ] Add `finishBatchRow` utility in `content.js` to log results and trigger page navigation for the next row
- [ ] Add `window.onload` auto-starter in `content.js` that detects batch state and automatically triggers the correct flow (Enrollment/Diagnostics/Both)
- [ ] Inject `finishBatchRow` calls at the successful/failure exit points of `fillBoth`, `fillForm`, and `fillDiagnostics`
