import { useRef } from 'react'
import { useT } from '../i18n'

const FEATURES = [
  { title: 'drop.f1.t', text: 'drop.f1.d' },
  { title: 'drop.f2.t', text: 'drop.f2.d' },
  { title: 'drop.f3.t', text: 'drop.f3.d' },
  { title: 'drop.f4.t', text: 'drop.f4.d' },
  { title: 'drop.f5.t', text: 'drop.f5.d' },
  { title: 'drop.f6.t', text: 'drop.f6.d' },
] as const

const STEPS = [
  { title: 'drop.s1.t', text: 'drop.s1.d' },
  { title: 'drop.s2.t', text: 'drop.s2.d' },
  { title: 'drop.s3.t', text: 'drop.s3.d' },
] as const

export function DropZone({ busy, onFile }: { busy: boolean; onFile: (file: File) => void }) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-1 items-start justify-center overflow-y-auto p-6">
      <div className="w-full max-w-4xl">
        <div className="mb-8 mt-2 text-center">
          <span className="text-xs font-medium tracking-[0.2em] text-indigo-600 uppercase">
            {t('drop.badge')}
          </span>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">
            {t('drop.title')}
            <span className="text-indigo-500">.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600">
            {t('drop.intro')}
          </p>
        </div>

        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            const file = event.dataTransfer.files[0]
            if (file) onFile(file)
          }}
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer rounded-2xl border-2 border-dashed border-zinc-300 bg-white/70 px-8 py-12 text-center transition-colors hover:border-indigo-400 hover:bg-white"
        >
          <p className="text-base font-medium text-zinc-800">
            {busy ? t('drop.busy') : t('drop.cta')}
          </p>
          <p className="mt-2 text-xs text-zinc-500">{t('drop.hint')}</p>
          <span className="mt-6 inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
            {t('drop.openButton')}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onFile(file)
              event.target.value = ''
            }}
          />
        </div>

        <div className="mt-6 grid gap-3 text-left sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-xl border border-zinc-200 bg-white p-4">
              <h2 className="text-sm font-medium text-zinc-900">{t(feature.title)}</h2>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">{t(feature.text)}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.title} className="rounded-xl bg-white/70 p-4 ring-1 ring-zinc-200">
              <p className="text-xs font-semibold text-zinc-800">{t(step.title)}</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">{t(step.text)}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-relaxed text-emerald-800">
          <strong className="font-semibold">{t('drop.privacy.strong')}</strong>{' '}
          {t('drop.privacy.text')}
        </div>

        <p className="mt-6 pb-2 text-center text-[11px] text-zinc-400">{t('drop.footer')}</p>
      </div>
    </div>
  )
}
