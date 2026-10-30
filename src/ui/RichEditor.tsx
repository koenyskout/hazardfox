import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import {
  $applyNodeReplacement, $createParagraphNode, $createTextNode, $getRoot, $getSelection, $insertNodes, $isElementNode, $isRangeSelection, $isTextNode,
  DecoratorNode, FORMAT_TEXT_COMMAND, type EditorConfig, type LexicalNode, type NodeKey, type SerializedLexicalNode, type Spread, type TextNode,
  type ElementNode,
} from 'lexical'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { LexicalTypeaheadMenuPlugin, MenuOption, useBasicTypeaheadTriggerMatch } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { byLabel } from '../model/labels'
import { isRef, parseRich, serializeRich, type Seg } from '../model/richtext'
import { KIND_NAMES, type Id, type Item } from '../model/types'
import { generateUcaText } from '../model/uca'
import { Ref } from './Fields'
import { useLabels, useProject } from './hooks'
import { summary } from './ItemCard'

type SerializedMention = Spread<{ id: Id }, SerializedLexicalNode>

/** Inline, atomic reference to an item, shown as a live chip. */
export class MentionNode extends DecoratorNode<JSX.Element> {
  __id: Id
  static getType() { return 'mention' }
  static clone(n: MentionNode) { return new MentionNode(n.__id, n.__key) }
  static importJSON(j: SerializedMention) { return $createMention(j.id) }
  constructor(id: Id, key?: NodeKey) { super(key); this.__id = id }
  exportJSON(): SerializedMention { return { type: 'mention', version: 1, id: this.__id } }
  createDOM(_c: EditorConfig) { const s = document.createElement('span'); s.className = 'mention-slot'; return s }
  updateDOM() { return false }
  isInline() { return true }
  getTextContent() { return '' }
  decorate() { return <Ref id={this.__id} /> }
}
export const $createMention = (id: Id) => $applyNodeReplacement(new MentionNode(id))
const $isMention = (n: LexicalNode | null | undefined): n is MentionNode => n instanceof MentionNode

function $load(value: string) {
  const root = $getRoot()
  root.clear()
  for (const segs of parseRich(value)) {
    const para = $createParagraphNode()
    for (const s of segs) {
      if (isRef(s)) para.append($createMention(s.id))
      else {
        const t = $createTextNode(s.text)
        if (s.bold) t.toggleFormat('bold')
        if (s.italic) t.toggleFormat('italic')
        para.append(t)
      }
    }
    root.append(para)
  }
}

function $dump(): string {
  const paras: Seg[][] = []
  const inline = (node: ElementNode, segs: Seg[]) => {
    for (const n of node.getChildren()) {
      if ($isMention(n)) segs.push({ id: n.__id })
      else if ($isTextNode(n)) segs.push({ text: n.getTextContent(), bold: n.hasFormat('bold'), italic: n.hasFormat('italic') })
      else if ($isElementNode(n)) inline(n, segs)
    }
  }
  for (const block of $getRoot().getChildren()) {
    const segs: Seg[] = []
    if ($isElementNode(block)) inline(block, segs)
    paras.push(segs)
  }
  return serializeRich(paras)
}

class ItemOption extends MenuOption {
  constructor(public item: Item) { super(item.id) }
}

/** `@` completion: filters by label, title and kind. */
function MentionMenu({ options }: { options: Item[] }) {
  const [editor] = useLexicalComposerContext()
  const p = useProject()
  const labels = useLabels()
  const [query, setQuery] = useState<string | null>(null)
  const text = (it: Item) => it.title || (it.kind === 'uca' ? generateUcaText(p, labels, it) : '')
  const hits = useMemo(() => {
    const t = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
    return options.filter((o) => { const s = `${labels[o.id]} ${text(o)} ${KIND_NAMES[o.kind]}`.toLowerCase(); return t.every((w) => s.includes(w)) }).slice(0, 40).map((o) => new ItemOption(o))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, options, labels, p])
  const trigger = useBasicTypeaheadTriggerMatch('@', { minLength: 0, maxLength: 60, punctuation: '@\\[\\]' })
  const mixed = new Set(options.map((o) => o.kind)).size > 1
  return (
    <LexicalTypeaheadMenuPlugin<ItemOption>
      triggerFn={trigger}
      onQueryChange={setQuery}
      options={hits}
      onSelectOption={(o, node: TextNode | null, close) => {
        editor.update(() => {
          const m = $createMention(o.item.id)
          const space = $createTextNode(' ')
          if (node) node.replace(m)
          else $insertNodes([m])
          m.insertAfter(space)
          space.select()
          close()
        })
      }}
      menuRenderFn={(anchor, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) =>
        anchor.current && hits.length
          ? createPortal(
              <ul className="mention-menu">
                {hits.map((o, n) => (
                  <li key={o.key} className={n === selectedIndex ? 'on' : ''} ref={(el) => { if (el && n === selectedIndex) el.scrollIntoView({ block: 'nearest' }) }}
                    onMouseEnter={() => setHighlightedIndex(n)} onMouseDown={(e) => { e.preventDefault(); selectOptionAndCleanUp(o) }}>
                    <span className={'chip k-' + o.item.kind}>{labels[o.item.id]}</span>
                    <span className="pk-main">
                      <span className="pk-title">{text(o.item) || <i className="muted">{KIND_NAMES[o.item.kind]}</i>}</span>
                      <span className="pk-sub">{[mixed && KIND_NAMES[o.item.kind], summary(p, labels, o.item)].filter(Boolean).join(' · ')}</span>
                    </span>
                  </li>
                ))}
              </ul>,
              anchor.current,
            )
          : null}
    />
  )
}

/** Keeps the editor in sync with the value when it changes from outside (undo, other item) and reports edits. */
function Sync({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editor] = useLexicalComposerContext()
  const last = useRef(value)
  useEffect(() => {
    if (value === last.current) return
    last.current = value
    editor.update(() => $load(value), { tag: 'external' })
  }, [value, editor])
  return (
    <OnChangePlugin ignoreSelectionChange onChange={(state, _e, tags) => {
      if (tags.has('external')) return
      const v = state.read($dump)
      if (v === last.current) return
      last.current = v
      onChange(v)
    }} />
  )
}

function Toolbar() {
  const [editor] = useLexicalComposerContext()
  const btn = (label: string, title: string, run: () => void, cls = '') => (
    <button type="button" tabIndex={-1} className={cls} title={title} onMouseDown={(e) => { e.preventDefault(); run() }}>{label}</button>
  )
  return (
    <div className="rich-tools">
      {btn('B', 'Bold (Ctrl+B)', () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold'), 'tb-b')}
      {btn('I', 'Italic (Ctrl+I)', () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic'), 'tb-i')}
      {btn('@', 'Insert reference (or type @)', () => editor.update(() => { const s = $getSelection(); if ($isRangeSelection(s)) s.insertText('@') }))}
    </div>
  )
}

/** Rich text editor: bold/italic, paragraphs, and `@` completion of live reference pills. Stored as a string (see `richtext.ts`). */
export function RichEditor(props: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  const p = useProject()
  const labels = useLabels()
  const options = useMemo(() => Object.values(p.items).sort(byLabel(labels)), [p, labels])
  const [initial] = useState(props.value)
  const config = useMemo(() => ({
    namespace: 'hazardfox',
    nodes: [MentionNode],
    theme: { text: { bold: 'rt-bold', italic: 'rt-italic' } },
    onError: (e: Error) => { throw e },
    editorState: () => $load(initial),
  }), [initial])
  return (
    <div className="rich" onClick={(e) => e.preventDefault() /* the enclosing <label> would forward the click to the first toolbar button */}>
      <LexicalComposer initialConfig={config}>
        <Toolbar />
        <RichTextPlugin
          contentEditable={<ContentEditable className="rich-edit" style={{ minHeight: ((props.rows ?? 3) + 2) * 1.35 + 'em' }} aria-placeholder={props.placeholder ?? ''} placeholder={<div className="rich-ph">{props.placeholder}</div>} />}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <ClickToEnd />
        <Sync value={props.value} onChange={props.onChange} />
        <MentionMenu options={options} />
      </LexicalComposer>
    </div>
  )
}

/** Clicking the empty area below the text puts the caret at the end. */
function ClickToEnd() {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    const root = editor.getRootElement()
    if (!root) return
    const h = (e: MouseEvent) => {
      if (e.target !== root) return
      e.preventDefault()
      root.focus()
      editor.update(() => { $getRoot().selectEnd() })
    }
    root.addEventListener('mousedown', h)
    return () => root.removeEventListener('mousedown', h)
  }, [editor])
  return null
}
