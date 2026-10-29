# HazardFox

Local-first tool for STPA and STPA-Sec analyses: losses, hazards, system constraints, domain model with process
variables, auto-drawn control structure, unsafe control actions, two kinds of loss scenarios, requirements, validation,
traceability, Word/Excel export and optional AI review via a local Ollama model.

```
npm install
npm run dev     # http://localhost:5173
npm test
```

Projects are single JSON files (Open / Save); an autosave copy lives in the browser's IndexedDB. Nothing leaves your
machine. See `PLAN.md` for design decisions and `CLAUDE.md` for developer notes.
