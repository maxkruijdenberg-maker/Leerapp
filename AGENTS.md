# Project guidance

This is an existing Dutch offline Electron learning app, not a website. Preserve the Windows desktop target and Dutch UI. Read README.md, LEES-MIJ.md and app/MAAK-EEN-LESPAKKET.md first. The latter is a generic lesson-package template. Personal learning preferences, political opinions and chat quotations must stay outside this public repository. Ask for locally provided preferences when making personalized lesson content.

Use Node.js 24+. Install with npm ci. Run npm test and npm run test:ui after functional changes. The UI test uses jsdom, not a real browser. Do not report Windows installation, video playback, PDF rendering, or visual checks as tested unless you actually performed those checks.

No actual exam source material has been supplied. Demo content is explicitly marked as a demonstration. Do not invent official exam coverage or avatar videos. AI videos are generated externally and uploaded into the app. Keep local storage, offline operation, backups and validated lesson-package import. Avoid adding an API key or external service requirement without a new user request.

Known handoff: v0.1 app logic has tests, but Electron could not run in the originating environment. Prioritize real Windows testing and UX refinement. The NSIS installer uses an external app directory, so distributing just the generated setup EXE is insufficient. See build/installer.cjs and README.md.

Do not commit node_modules, generated installers, user progress, source PDFs/photos, secrets or temporary outputs. Keep the small demonstration assets tracked so a clean checkout is runnable.
