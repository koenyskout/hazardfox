import { deserialize, serialize } from './serialize'
import { useStore } from './store'
import type { Project } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */
const w = window as any
export const fsAccess = typeof w.showOpenFilePicker === 'function'

const DB = 'hazardfox'
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore('kv')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function kv<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb()
  return new Promise((res, rej) => {
    const rq = f(db.transaction('kv', mode).objectStore('kv'))
    rq.onsuccess = () => res(rq.result)
    rq.onerror = () => rej(rq.error)
  })
}

export const autosave = (p: Project, fileName: string | null) =>
  kv('readwrite', (s) => s.put({ text: serialize(p), fileName, at: Date.now() }, 'autosave')).catch(() => {})

export async function restoreAutosave(): Promise<{ project: Project; fileName: string | null } | null> {
  try {
    const v = await kv<any>('readonly', (s) => s.get('autosave'))
    return v ? { project: deserialize(v.text), fileName: v.fileName } : null
  } catch {
    return null
  }
}

const jsonType = [{ description: 'HazardFox project', accept: { 'application/json': ['.hazardfox.json', '.json'] } }]

export async function openProject() {
  let text: string, name: string, handle: unknown = null
  if (fsAccess) {
    const [h] = await w.showOpenFilePicker({ types: jsonType })
    const f = await h.getFile()
    text = await f.text()
    name = f.name
    handle = h
  } else {
    const f = await pickFile('.json,application/json')
    text = await f.text()
    name = f.name
  }
  useStore.getState().load(deserialize(text), name, handle)
}

function pickFile(accept: string): Promise<File> {
  return new Promise((res, rej) => {
    const i = document.createElement('input')
    i.type = 'file'
    i.accept = accept
    i.onchange = () => (i.files?.[0] ? res(i.files[0]) : rej(new Error('No file')))
    i.click()
  })
}

export function download(name: string, data: Blob | string, type = 'application/json') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export async function saveProject(as = false) {
  const s = useStore.getState()
  const text = serialize(s.project)
  const suggested = (s.project.meta.name || 'analysis').replace(/[^\w.-]+/g, '_') + '.hazardfox.json'
  if (fsAccess) {
    let h = as ? null : (s.fileHandle as any)
    if (!h) h = await w.showSaveFilePicker({ suggestedName: s.fileName ?? suggested, types: jsonType })
    const wr = await h.createWritable()
    await wr.write(text)
    await wr.close()
    s.setFile(h.name, h)
  } else {
    download(s.fileName ?? suggested, text)
    s.setFile(s.fileName ?? suggested, null)
  }
  useStore.getState().markSaved()
}

/** Wire autosave (debounced) and leave-page protection. */
export function startAutosave() {
  let t: ReturnType<typeof setTimeout> | undefined
  useStore.subscribe((s, prev) => {
    if (s.project === prev.project) return
    clearTimeout(t)
    t = setTimeout(() => autosave(s.project, s.fileName), 400)
  })
  window.addEventListener('beforeunload', (e) => {
    if (useStore.getState().dirty) e.preventDefault()
  })
}
