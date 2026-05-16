# Changelog

This file documents the changes made to the `nova-editor` repository.

## Issue #24: Improve HTML viewer error messages
*Category: good first issue, area: ux, scope: small*

**Description:**
Implemented graceful error UI inside the `HtmlViewerTab` to surface HTML preview setup failures, preventing the application from silently failing when an error occurs during folder selection or preview generation.

**Changes Made:**
- **State Management:** Added an `error` state (`useState<string | null>(null)`) to track and display setup failures.
- **Error Handling:** Updated the `catch` block in the `pickFolder` callback to correctly capture and surface errors from the `Promise.all` setup phase (file scanning and server starting) instead of silently swallowing them.
- **UI Updates:**
  - Added a visual loading overlay with a spinner (`RefreshCw`) and "Starting preview server…" text that displays while the directory is being scanned and the server is starting.
  - Added an inline error banner overlay using the `AlertTriangle` icon from `lucide-react`.
  - The error banner clearly displays the error message to the user.
  - Included a **"Retry"** button within the error banner that allows the user to easily re-trigger the `pickFolder` action.
  - Ensured the default placeholder text ("Select an HTML file to preview") is properly hidden while scanning is in progress or if an error is present.
- **Files Modified:** 
  - `src/components/HtmlViewerTab.tsx`
