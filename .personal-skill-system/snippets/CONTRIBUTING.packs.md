## AI Tooling

This repository uses `.personal-skill-system/packs.lock.json` to declare AI packs.

- Update the lock with `npm run packs:update -- [flags]`.
- Validate it with `npm run packs:check`.
- Re-run `npx personal-skill-system --target claude|codex|gemini -y` after pack changes.

Current host policies: claude=auto, codex=auto, gemini=auto

