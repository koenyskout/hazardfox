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

## Use from an AI agent (MCP)

`src/mcp/` is a stdio [MCP](https://modelcontextprotocol.io) server that lets an agent perform an STPA / STPA-Sec analysis
on a project file (the same `*.hazardfox.json` the web app opens, so you can review and edit the agent's work in the UI).
It reuses the pure `src/model/` code; every write is validated and saved immediately.

```
npm run mcp -- path/to/analysis.hazardfox.json     # or set HAZARDFOX_PROJECT
claude mcp add hazardfox -- npx tsx /abs/path/to/hazardfox/src/mcp/server.ts /abs/path/to/analysis.hazardfox.json
```

Tools: `stpa_guide`, `open_project`, `project_summary`, `describe_kinds`, `update_project_meta`, `list_items`, `get_item`,
`create_items`, `update_items`, `delete_items` (with `dry_run`), `move_item`, `uca_coverage`, `validate`, `export_report`
(Markdown), `export_xlsx`; prompt `stpa-analysis`. Items are addressed by their derived labels (`H-1.2`, `UCA-4`); batch
creates can use `$alias` references. Close the project in the web app before the agent writes (the file is re-read on every call).
