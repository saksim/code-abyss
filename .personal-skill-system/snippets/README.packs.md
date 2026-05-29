## AI Pack Bootstrap

This repository declares Personal Skill System packs in `.personal-skill-system/packs.lock.json`.

- claude: required=[gstack], optional=[none], optional_policy=auto
- codex: required=[gstack], optional=[none], optional_policy=auto
- gemini: required=[gstack], optional=[none], optional_policy=auto

Recommended install:

```bash
npx personal-skill-system --target claude -y
npx personal-skill-system --target codex -y
npx personal-skill-system --target gemini -y
```

