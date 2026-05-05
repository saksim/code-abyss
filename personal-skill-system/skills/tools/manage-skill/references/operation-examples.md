# Operation Examples

Create a workflow:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js create workflow ship-v2
```

Show a skill:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js show review
```

Update frontmatter fields:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js update review --set status=stable --set owner=self
```

Archive a skill:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js archive review
```

Delete a skill:

```bash
node personal-skill-system/skills/tools/manage-skill/scripts/run.js delete review
```
