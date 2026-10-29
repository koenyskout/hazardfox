import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { buildXlsx } from '../export/xlsx'
import { defaultOptions } from '../export/tables'
import { emptyProject } from '../model/create'
import { deserialize, serialize } from '../model/serialize'
import type { Project } from '../model/types'
import { GUIDE } from './guide'
import { nextSteps, TOOLS } from './tools'

let current: string | null = process.argv[2] ?? process.env.HAZARDFOX_PROJECT ?? null
if (current) current = resolve(current)

const text = (v: unknown) => ({ content: [{ type: 'text' as const, text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] })
const fail = (e: unknown) => ({ isError: true, content: [{ type: 'text' as const, text: (e as Error).message }] })

const load = (): Project => {
  if (!current) throw new Error('No project open. Call open_project with a path (e.g. "analysis.hazardfox.json", create=true for a new one) or start the server with the path as argument.')
  if (!existsSync(current)) throw new Error(`Project file ${current} does not exist; call open_project with create=true.`)
  return deserialize(readFileSync(current, 'utf8'))
}
const save = (p: Project) => {
  const tmp = `${current}.tmp`
  writeFileSync(tmp, serialize(p))
  renameSync(tmp, current!)
}
const checkPath = (path: string, ext: RegExp) => {
  if (!ext.test(path)) throw new Error(`Path must match ${ext}`)
  return resolve(path)
}

export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'hazardfox', version: '0.1.0' },
    { instructions: `HazardFox: STPA / STPA-Sec safety and security analysis stored in a JSON project file. Call stpa_guide once for the method, then project_summary.` },
  )

  server.registerTool('open_project', {
    description: 'Open (or create) the project file all other tools work on. Files are the same ones the HazardFox web app opens/saves (*.hazardfox.json).',
    inputSchema: { path: z.string(), create: z.boolean().optional().describe('Create a new empty project if the file does not exist'), name: z.string().optional(), description: z.string().optional() },
    annotations: { destructiveHint: false },
  }, async (a) => {
    try {
      const path = checkPath(a.path, /\.json$/)
      if (!existsSync(path)) {
        if (!a.create) throw new Error(`${path} does not exist; pass create=true to create it`)
        const p = emptyProject()
        if (a.name) p.meta.name = a.name
        if (a.description) p.meta.description = a.description
        current = path
        save(p)
      } else current = path
      const p = load()
      return text({ path: current, name: p.meta.name, nextSteps: nextSteps(p) })
    } catch (e) { return fail(e) }
  })

  server.registerTool('stpa_guide', { description: 'The STPA / STPA-Sec method as applied in this tool: steps, item kinds, quality rules, conventions. Read before starting.', inputSchema: {} }, async () => text(GUIDE))

  for (const t of TOOLS) {
    server.registerTool(t.name, {
      description: t.description,
      inputSchema: t.shape,
      annotations: { readOnlyHint: !t.writes, destructiveHint: !!t.destructive },
    }, async (args: Record<string, unknown>) => {
      try {
        const p = load()
        const out = t.run(p, args as never)
        if (out.project && out.project !== p) save(out.project)
        return text(out.result)
      } catch (e) { return fail(e) }
    })
  }

  server.registerTool('export_xlsx', {
    description: 'Write the analysis as an Excel workbook (one sheet per table) to a .xlsx path.',
    inputSchema: { path: z.string() },
  }, async (a) => {
    try {
      const path = checkPath(a.path, /\.xlsx$/)
      const blob = await buildXlsx(load(), defaultOptions())
      writeFileSync(path, Buffer.from(await blob.arrayBuffer()))
      return text({ written: path })
    } catch (e) { return fail(e) }
  })

  server.registerPrompt('stpa-analysis', {
    description: 'Run a complete STPA (safety) or STPA-Sec (safety + security) analysis of a system',
    argsSchema: { system: z.string().describe('Description of the system and its purpose'), mode: z.enum(['safety', 'security', 'both']).optional() },
  }, ({ system, mode }) => ({
    messages: [{ role: 'user', content: { type: 'text', text: `${GUIDE}\n\nPerform a ${mode === 'safety' ? 'STPA safety' : mode === 'security' ? 'STPA-Sec security' : 'STPA-Sec safety and security'} analysis of this system. Work step by step, save everything with the tools, ask me about unknowns, and finish with validate.\n\nSystem:\n${system}` } }],
  }))

  return server
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('mcp/server.ts')) {
  await createServer().connect(new StdioServerTransport())
}
