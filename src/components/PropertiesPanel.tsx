import { useT } from '../i18n'
import {
  canvasMeasure,
  displayText,
  fitSize,
  hexToRgb,
  lineStep,
  rgbToHex,
  wrapText,
  type TextCase,
  type TextEdit,
} from '../pdf/model'

type Props = {
  edit: TextEdit
  onChange: (patch: Partial<TextEdit>) => void
  onSnapshot: () => void
  onRemove: () => void
  onDuplicate: () => void
  onAlign: (kind: 'x' | 'y') => void
  onCopyStyle: () => void
  onPasteStyle: () => void
  canPasteStyle: boolean
  onCenter: () => void
  onRaise: () => void
  onLower: () => void
}

export function PropertiesPanel({
  edit,
  onChange,
  onSnapshot,
  onRemove,
  onDuplicate,
  onAlign,
  onCopyStyle,
  onPasteStyle,
  canPasteStyle,
  onCenter,
  onRaise,
  onLower,
}: Props) {
  const t = useT()
  const inputClass =
    'w-full rounded-md border border-zinc-300 px-2 py-1 text-xs outline-none focus:border-indigo-500'
  const shown = displayText(edit)
  const measure = canvasMeasure(edit.font, edit.bold)
  const spacing = edit.letterSpacing || 0
  const step = lineStep(edit)
  const maxLines = edit.cover
    ? Math.max(1, Math.round(edit.cover.height / step))
    : Math.max(1, edit.text.split('\n').length)

  function fitToBox() {
    onChange({
      size: fitSize(shown, edit.width, edit.size, maxLines, measure, spacing),
    })
  }

  const lines = wrapText(shown || ' ', edit.size, edit.width, measure, spacing)
  const overflow = lines.length - maxLines

  return (
    <div className="px-4 py-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
          {edit.kind === 'replace' ? t('text.heading.replace') : t('text.heading.add')}
        </h2>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-zinc-400">
            {t('common.pageShort', { page: edit.page })}
          </span>
          <button
            type="button"
            className={`tool px-1.5 ${edit.locked ? 'tool-active' : ''}`}
            onClick={() => onChange({ locked: !edit.locked })}
            title={edit.locked ? t('text.unlockTitle') : t('text.lockTitle')}
          >
            {edit.locked ? '🔒' : '🔓'}
          </button>
        </div>
      </div>

      {edit.locked && (
        <p className="mt-2 rounded-lg bg-zinc-100 px-2 py-1.5 text-[11px] leading-relaxed text-zinc-600">
          {t('text.lockedNote')}
        </p>
      )}

      <p className="mt-2 line-clamp-3 rounded-lg bg-zinc-50 px-2 py-1.5 text-xs text-zinc-600">
        {shown.trim() || t('text.empty')}
      </p>

      {overflow > 0 && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-700">
          {t('text.overflow', { count: overflow })}
        </p>
      )}

      <Field label={t('text.size')}>
        <div className="flex gap-1">
          <input
            type="number"
            min={4}
            max={200}
            step={0.5}
            value={Math.round(edit.size * 100) / 100}
            onChange={(event) => onChange({ size: Number(event.target.value) || 1 })}
            className={inputClass}
          />
          <button
            type="button"
            className="tool shrink-0"
            onClick={fitToBox}
            title={t('text.fitTitle')}
          >
            {t('text.fit')}
          </button>
        </div>
      </Field>

      <Field label={t('text.font')}>
        <div className="flex gap-1">
          <select
            value={edit.font}
            onChange={(event) => onChange({ font: event.target.value as TextEdit['font'] })}
            className={inputClass}
          >
            <option value="sans">{t('text.fontSans')}</option>
            <option value="serif">{t('text.fontSerif')}</option>
          </select>
          <button
            type="button"
            onClick={() => onChange({ bold: !edit.bold })}
            className={`tool w-9 font-semibold ${edit.bold ? 'tool-active' : ''}`}
          >
            B
          </button>
        </div>
      </Field>

      <Field label={t('text.align')}>
        <div className="grid grid-cols-3 gap-1">
          {(['left', 'center', 'right'] as const).map((align) => (
            <button
              key={align}
              type="button"
              onClick={() => onChange({ align })}
              className={`tool ${edit.align === align ? 'tool-active' : ''}`}
            >
              {align === 'left' ? '◧' : align === 'center' ? '▣' : '◨'}
            </button>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <button
            type="button"
            className="tool"
            onClick={() => onAlign('x')}
            title={t('text.alignEdgeTitle')}
          >
            {t('text.alignEdge')}
          </button>
          <button
            type="button"
            className="tool"
            onClick={() => onAlign('y')}
            title={t('text.alignBaselineTitle')}
          >
            {t('text.alignBaseline')}
          </button>
        </div>
      </Field>

      <Field label={t('text.style')}>
        <div className="grid grid-cols-4 gap-1">
          <button
            type="button"
            onClick={() => onChange({ bold: !edit.bold })}
            className={`tool font-semibold ${edit.bold ? 'tool-active' : ''}`}
            title={t('text.boldTitle')}
          >
            B
          </button>
          <button
            type="button"
            onClick={() => onChange({ underline: !edit.underline })}
            className={`tool underline ${edit.underline ? 'tool-active' : ''}`}
            title={t('text.underlineTitle')}
          >
            U
          </button>
          <button
            type="button"
            onClick={() => onChange({ strike: !edit.strike })}
            className={`tool line-through ${edit.strike ? 'tool-active' : ''}`}
            title={t('text.strikeTitle')}
          >
            S
          </button>
          <button
            type="button"
            onClick={() =>
              onChange({ textCase: (edit.textCase === 'upper' ? 'none' : 'upper') as TextCase })
            }
            className={`tool ${edit.textCase === 'upper' ? 'tool-active' : ''}`}
            title={t('text.upperTitle')}
          >
            Aa
          </button>
        </div>
      </Field>

      <Field label={t('text.opacity', { value: Math.round((edit.opacity ?? 1) * 100) })}>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={edit.opacity ?? 1}
          onChange={(event) => onChange({ opacity: Number(event.target.value) })}
          className="w-full accent-indigo-600"
        />
      </Field>

      <Field label={t('text.blockBackground')}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`tool ${edit.highlight ? 'tool-active' : ''}`}
            onClick={() =>
              onChange({
                highlight: edit.highlight ? null : { color: [255, 241, 168], padding: 2 },
              })
            }
          >
            {edit.highlight ? t('text.remove') : t('text.add')}
          </button>
          {edit.highlight && (
            <input
              type="color"
              value={rgbToHex(edit.highlight.color)}
              onChange={(event) =>
                onChange({
                  highlight: { ...edit.highlight!, color: hexToRgb(event.target.value) },
                })
              }
              className="h-7 w-10 cursor-pointer rounded border border-zinc-300 bg-white p-0"
            />
          )}
        </div>
      </Field>

      <Field label={t('text.textColor')}>
        <ColorRow value={edit.color} onChange={(color) => onChange({ color })} />
      </Field>

      {edit.cover && (
        <Field label={t('text.coverColor')}>
          <ColorRow
            value={edit.cover.color}
            onChange={(color) => onChange({ cover: { ...edit.cover!, color } })}
          />
        </Field>
      )}

      <Field label={t('text.lineHeight', { value: (edit.lineHeight || 1.18).toFixed(2) })}>
        <input
          type="range"
          min={0.8}
          max={2.5}
          step={0.01}
          value={edit.lineHeight || 1.18}
          onChange={(event) => onChange({ lineHeight: Number(event.target.value) })}
          className="w-full accent-indigo-600"
        />
      </Field>

      <Field label={t('text.letterSpacing')}>
        <div className="flex gap-1">
          <input
            type="number"
            min={-2}
            max={20}
            step={0.1}
            value={edit.letterSpacing || 0}
            onChange={(event) => onChange({ letterSpacing: Number(event.target.value) || 0 })}
            className={inputClass}
          />
          <button
            type="button"
            className="tool shrink-0"
            onClick={() => onChange({ letterSpacing: 0, lineHeight: 1.18 })}
            title={t('text.resetSpacingTitle')}
          >
            {t('text.resetSpacing')}
          </button>
        </div>
      </Field>

      <Field label={t('text.width')}>
        <input
          type="number"
          min={10}
          step={5}
          value={Math.round(edit.width)}
          onChange={(event) => onChange({ width: Math.max(10, Number(event.target.value) || 10) })}
          className={inputClass}
        />
      </Field>

      <Field label={t('text.position')}>
        <div className="grid grid-cols-2 gap-1">
          <label className="flex items-center gap-1 text-[11px] text-zinc-500">
            X
            <input
              type="number"
              step={1}
              value={Math.round(edit.x * 10) / 10}
              onChange={(event) => onChange({ x: Number(event.target.value) || 0 })}
              className={inputClass}
            />
          </label>
          <label className="flex items-center gap-1 text-[11px] text-zinc-500">
            Y
            <input
              type="number"
              step={1}
              value={Math.round(edit.y * 10) / 10}
              onChange={(event) => onChange({ y: Number(event.target.value) || 0 })}
              className={inputClass}
            />
          </label>
        </div>
      </Field>

      <Field label={t('text.layer')}>
        <div className="grid grid-cols-3 gap-1">
          <button type="button" className="tool" onClick={onRaise} title={t('text.raiseTitle')}>
            {t('text.raise')}
          </button>
          <button type="button" className="tool" onClick={onLower} title={t('text.lowerTitle')}>
            {t('text.lower')}
          </button>
          <button type="button" className="tool" onClick={onCenter} title={t('text.centerTitle')}>
            {t('text.center')}
          </button>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <button
            type="button"
            className="tool"
            onClick={onCopyStyle}
            title={t('text.copyStyleTitle')}
          >
            {t('text.copyStyle')}
          </button>
          <button
            type="button"
            className="tool"
            onClick={onPasteStyle}
            disabled={!canPasteStyle}
            title={t('text.pasteStyleTitle')}
          >
            {t('text.pasteStyle')}
          </button>
        </div>
      </Field>

      <div className="mt-5 space-y-1 border-t border-zinc-200 pt-4">
        <button type="button" className="tool w-full justify-start" onClick={onDuplicate}>
          {t('text.duplicate')}
        </button>
        <button
          type="button"
          className="tool w-full justify-start"
          onClick={() => {
            onSnapshot()
            onChange({ text: '' })
          }}
        >
          {t('text.erase')}
        </button>
        <button
          type="button"
          className="tool w-full justify-start"
          onClick={() => onChange({ locked: !edit.locked })}
        >
          {edit.locked ? t('text.unlock') : t('text.lock')}
        </button>
        <button type="button" className="tool w-full justify-start text-red-600" onClick={onRemove}>
          {edit.kind === 'replace' ? t('text.restoreOriginal') : t('text.removeBlock')}
        </button>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-zinc-400">
        {edit.original ? t('text.noteReplace') : t('text.noteAdd')}
      </p>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <span className="mb-1 block text-[11px] font-medium text-zinc-500">{label}</span>
      {children}
    </div>
  )
}

function ColorRow({
  value,
  onChange,
}: {
  value: [number, number, number]
  onChange: (color: [number, number, number]) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={rgbToHex(value)}
        onChange={(event) => onChange(hexToRgb(event.target.value))}
        className="h-7 w-10 cursor-pointer rounded border border-zinc-300 bg-white p-0"
      />
      <span className="text-[11px] text-zinc-500">{rgbToHex(value)}</span>
    </div>
  )
}
