import { LANGS, useI18n } from '../i18n'

/** Compact language switcher; the choice is remembered for the next visit. */
export function LanguageSelect({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useI18n()
  return (
    <label className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
      <span className={compact ? 'sr-only' : 'sr-only sm:not-sr-only'}>{t('lang.label')}</span>
      <select
        value={lang}
        onChange={(event) => setLang(event.target.value as typeof lang)}
        className="rounded-md border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px] text-zinc-700 outline-none focus:border-indigo-500"
        aria-label={t('lang.label')}
      >
        {LANGS.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  )
}
