# Contributing

Thanks for checking out TryItOut. This project is still an MVP, so small, focused contributions are the easiest to review.

## Good First Contributions

- Improve scenario copy for side-hustle, dating, or life-choice simulations.
- Add tests around prompt builders, response normalization, or UI flows.
- Improve accessibility and mobile layout.
- Add provider adapters or deployment notes.
- Refine README examples and screenshots.

## Local Checks

Run these before opening a pull request:

```bash
cd frontend
npm run lint
npm test
npm run build
```

## Pull Request Style

- Keep changes scoped to one concern.
- Include tests when changing behavior.
- Do not commit `.env`, logs, debug traces, raw user inputs, or generated model output.
- Note which AI provider and runtime flags you used when testing AI-related changes.

