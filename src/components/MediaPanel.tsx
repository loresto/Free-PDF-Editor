import { hexToRgb, rgbToHex, type ImageEdit, type StrokeEdit } from '../pdf/model'

type ImageProps = {
  image: ImageEdit
  onChange: (patch: Partial<ImageEdit>) => void
  onDuplicate: () => void
  onRemove: () => void
}

/** Properties of an inserted picture (signature, stamp, logo). */
export function ImagePanel({ image, onChange, onDuplicate, onRemove }: ImageProps) {
  const ratio = image.height / Math.max(1, image.width)
  return (
    <div className="px-4 py-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
          Изображение
        </h2>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-zinc-400">стр. {image.page}</span>
          <button
            type="button"
            className={`tool px-1.5 ${image.locked ? 'tool-active' : ''}`}
            onClick={() => onChange({ locked: !image.locked })}
            title={image.locked ? 'Разблокировать' : 'Заблокировать'}
          >
            {image.locked ? '🔒' : '🔓'}
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 rounded-lg bg-zinc-50 px-2 py-1.5">
        <img
          src={image.dataUrl}
          alt={image.label}
          className="h-10 w-10 rounded border border-zinc-200 bg-white object-contain"
        />
        <span className="truncate text-xs text-zinc-600">{image.label}</span>
      </div>

      <Field label="Размер (ширина / высота), pt">
        <div className="grid grid-cols-2 gap-1">
          <input
            type="number"
            min={4}
            step={2}
            value={Math.round(image.width * 10) / 10}
            onChange={(event) => {
              const width = Math.max(4, Number(event.target.value) || 4)
              onChange({ width, height: Math.round(width * ratio * 10) / 10 })
            }}
            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-xs outline-none focus:border-indigo-500"
          />
          <input
            type="number"
            min={4}
            step={2}
            value={Math.round(image.height * 10) / 10}
            onChange={(event) =>
              onChange({ height: Math.max(4, Number(event.target.value) || 4) })
            }
            className="w-full rounded-md border border-zinc-300 px-2 py-1 text-xs outline-none focus:border-indigo-500"
          />
        </div>
      </Field>

      <Field label="Положение, pt">
        <div className="grid grid-cols-2 gap-1">
          {(['x', 'y'] as const).map((key) => (
            <label key={key} className="flex items-center gap-1 text-[11px] text-zinc-500">
              {key.toUpperCase()}
              <input
                type="number"
                step={1}
                value={Math.round(image[key] * 10) / 10}
                onChange={(event) => onChange({ [key]: Number(event.target.value) || 0 })}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-800 outline-none focus:border-indigo-500"
              />
            </label>
          ))}
        </div>
      </Field>

      <Field label={`Поворот · ${Math.round(image.rotation || 0)}°`}>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="tool w-8 shrink-0"
            onClick={() => onChange({ rotation: (image.rotation || 0) + 90 })}
            title="Повернуть на 90° против часовой"
          >
            ⟲
          </button>
          <input
            type="range"
            min={-180}
            max={180}
            step={1}
            value={image.rotation || 0}
            onChange={(event) => onChange({ rotation: Number(event.target.value) })}
            className="w-full accent-indigo-600"
          />
          <button
            type="button"
            className="tool w-8 shrink-0"
            onClick={() => onChange({ rotation: (image.rotation || 0) - 90 })}
            title="Повернуть на 90° по часовой"
          >
            ⟳
          </button>
        </div>
        <div className="mt-1 grid grid-cols-3 gap-1">
          <button
            type="button"
            className="tool"
            onClick={() => onChange({ rotation: 0 })}
            title="Без поворота"
          >
            0°
          </button>
          <button
            type="button"
            className="tool"
            onClick={() => onChange({ rotation: -15 })}
            title="Повернуть на 15° по часовой"
          >
            −15°
          </button>
          <button
            type="button"
            className="tool"
            onClick={() => onChange({ rotation: 15 })}
            title="Повернуть на 15° против часовой"
          >
            +15°
          </button>
        </div>
      </Field>

      <Field label={`Прозрачность · ${Math.round(image.opacity * 100)}%`}>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={image.opacity}
          onChange={(event) => onChange({ opacity: Number(event.target.value) })}
          className="w-full accent-indigo-600"
        />
      </Field>

      <div className="mt-5 space-y-1 border-t border-zinc-200 pt-4">
        <button type="button" className="tool w-full justify-start" onClick={onDuplicate}>
          Дублировать
        </button>
        <button type="button" className="tool w-full justify-start text-red-600" onClick={onRemove}>
          Удалить изображение
        </button>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-zinc-400">
        Подпись и печать лучше готовить в PNG с прозрачным фоном: тогда фон документа
        остаётся виден. Тяните картинку мышью, уголком — размер, ползунком — поворот
        вокруг центра.
      </p>
    </div>
  )
}

type StrokeProps = {
  stroke: StrokeEdit
  onChange: (patch: Partial<StrokeEdit>) => void
  onRemove: () => void
}

/** Properties of a freehand line. */
export function StrokePanel({ stroke, onChange, onRemove }: StrokeProps) {
  return (
    <div className="px-4 py-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
          Линия от руки
        </h2>
        <span className="text-[11px] text-zinc-400">стр. {stroke.page}</span>
      </div>

      <Field label="Цвет">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={rgbToHex(stroke.color)}
            onChange={(event) => onChange({ color: hexToRgb(event.target.value) })}
            className="h-7 w-10 cursor-pointer rounded border border-zinc-300 bg-white p-0"
          />
          <span className="text-[11px] text-zinc-500">{rgbToHex(stroke.color)}</span>
        </div>
      </Field>

      <Field label="Толщина, pt">
        <input
          type="range"
          min={0.3}
          max={12}
          step={0.1}
          value={stroke.width}
          onChange={(event) => onChange({ width: Number(event.target.value) })}
          className="w-full accent-indigo-600"
        />
      </Field>

      <Field label={`Прозрачность · ${Math.round(stroke.opacity * 100)}%`}>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={stroke.opacity}
          onChange={(event) => onChange({ opacity: Number(event.target.value) })}
          className="w-full accent-indigo-600"
        />
      </Field>

      <div className="mt-5 space-y-1 border-t border-zinc-200 pt-4">
        <button type="button" className="tool w-full justify-start text-red-600" onClick={onRemove}>
          Удалить линию
        </button>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-zinc-400">
        {stroke.points.length} точек. Чтобы нарисовать ещё, включите «Рисовать» в панели
        сверху.
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
