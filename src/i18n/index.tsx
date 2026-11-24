import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { dictionaries, LANGS, type Lang, type MessageKey } from './locales'

export { LANGS, type Lang, type MessageKey }

const STORAGE_KEY = 'pdf-pravka.lang'

/** Stored choice → browser language → English. */
function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && saved in dictionaries) return saved as Lang
  } catch {
    // приватный режим или отключённое хранилище
  }
  const candidates = [
    ...(navigator.languages ?? []),
    navigator.language,
  ].map((value) => value?.toLowerCase().split('-')[0])
  for (const candidate of candidates) {
    if (candidate && candidate in dictionaries) return candidate as Lang
  }
  return 'en'
}

type I18n = {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectLang())

  useEffect(() => {
    document.documentElement.lang = lang
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // запоминать выбор не обязательно
    }
  }, [lang])

  const value = useMemo<I18n>(() => {
    const t: I18n['t'] = (key, vars) => {
      const template = dictionaries[lang][key] ?? dictionaries.ru[key] ?? key
      if (!vars) return template
      return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in vars ? String(vars[name]) : match,
      )
    }
    return { lang, setLang: setLangState, t }
  }, [lang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used inside I18nProvider')
  return context
}

/** Shorthand when only the translator is needed. */
export function useT(): I18n['t'] {
  return useI18n().t
}
