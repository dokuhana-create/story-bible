# Story Bible for the iPhone

The empty app that puts your story bible on your iPhone home screen. These files hold no story: no names,
no text, nothing from your bible. Your bible stays on your laptop, in OneDrive and on your phone only. On first
open, the app asks you to choose *Story Bible (pocket).json* from Files › OneDrive, and keeps it on the phone.

## Put it on GitHub Pages (once)

1. Sign in at github.com and make a new repository: **+** › **New repository**, name it `story-bible`,
   **Public**, then **Create repository**.
2. On the new repository's page: **uploading an existing file**. Drag in every file of this folder
   (`index.html`, `app.js`, `app.css`, `sw.js`, `manifest.webmanifest`, the four `.png` icons and the two book
   pictures; this README too if you like), then **Commit changes**.
3. **Settings** › **Pages** › *Build and deployment*: Source **Deploy from a branch**, Branch **main**, folder
   **/ (root)**, **Save**. After a minute the page shows the address, like
   `https://yourname.github.io/story-bible/`.

## On the iPhone (once)

1. Open that address in **Safari**, tap **Share** › **Add to Home Screen** › **Add**.
2. Open **Story Bible** from the home screen, tap **Load my bible**, **Browse**, and choose
   OneDrive › Documents › Scrivener › Story Bible › **Story Bible (pocket).json**.
3. For notes: in **Shortcuts**, open your **To my bible** Shortcut, tap **Ask for Input**, and set its
   **Default Answer** to **Shortcut Input**. A note from the app then comes in already written; tap **Done**.

## A new version of the app

Upload the changed files to the same repository the same way (they replace the old ones). The phone picks them
up the next time it opens the app with a connection.
