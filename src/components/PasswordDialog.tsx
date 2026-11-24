import { useState } from 'react'
import { useT } from '../i18n'

export function PasswordDialog({
  incorrect,
  onSubmit,
  onCancel,
}: {
  incorrect: boolean
  onSubmit: (password: string) => void
  onCancel: () => void
}) {
  const t = useT()
  const [value, setValue] = useState('')

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-900/40 p-4 backdrop-blur-sm">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(value)
        }}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-zinc-900">{t('pwd.title')}</h2>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">{t('pwd.text')}</p>
        {incorrect && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
            {t('pwd.incorrect')}
          </p>
        )}
        <input
          autoFocus
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="mt-4 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          placeholder={t('pwd.placeholder')}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-xs text-zinc-600 hover:bg-zinc-100"
            onClick={onCancel}
          >
            {t('common.cancel')}
          </button>
          <button className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white">
            {t('pwd.open')}
          </button>
        </div>
      </form>
    </div>
  )
}
