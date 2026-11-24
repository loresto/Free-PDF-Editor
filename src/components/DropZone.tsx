import { useRef } from 'react'

const FEATURES: { title: string; text: string }[] = [
  {
    title: 'Правка текста',
    text: 'Клик по строке открывает её содержимое. Старая строка вырезается из content stream, новая рисуется шрифтом с кириллицей.',
  },
  {
    title: 'Оформление',
    text: 'Кегль, шрифт, цвет, прозрачность, плашка под текстом, межстрочный и межбуквенный интервал, подчёркивание и зачёркивание.',
  },
  {
    title: 'Подписи и печати',
    text: 'Вставьте PNG с прозрачным фоном, поставьте размер, прозрачность и поворот — картинка станет частью PDF.',
  },
  {
    title: 'Рисование',
    text: 'Подпись или пометки от руки сохраняются вектором: цвет, толщина, прозрачность, удаление и повторное редактирование.',
  },
  {
    title: 'Страницы и поиск',
    text: 'Найдите и замените текст по документу, поменяйте порядок страниц или удалите лишние — результат попадёт в файл.',
  },
  {
    title: 'Word → PDF',
    text: 'Перетащите .docx: документ разложится по страницам A4 с таблицами и картинками, останется выбрать «Сохранить как PDF».',
  },
]

export function DropZone({ busy, onFile }: { busy: boolean; onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-1 items-start justify-center overflow-y-auto p-6">
      <div className="w-full max-w-4xl">
        <div className="mb-8 text-center">
          <span className="text-xs font-medium tracking-[0.2em] text-indigo-600 uppercase">
            PDF и Word — локально в браузере
          </span>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">
            Редактор PDF
            <span className="text-indigo-500">.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600">
            Меняйте текст прямо на странице, добавляйте надписи, подписи, печати и пометки,
            снимайте защиту с файлов, пароль от которых вы знаете, и переводите Word в PDF.
            Ни один файл не отправляется на сервер — всё происходит на вашем компьютере.
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
            {busy ? 'Открываю файл…' : 'Перетащите PDF или .docx сюда либо нажмите, чтобы выбрать'}
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            До нескольких сотен страниц · пароль спрашивается только при необходимости ·
            .docx переводится в PDF здесь же
          </p>
          <span className="mt-6 inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
            Открыть файл
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
              <h2 className="text-sm font-medium text-zinc-900">{feature.title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">{feature.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            ['1. Откройте файл', 'PDF попадёт в редактор, .docx — в конвертер Word → PDF.'],
            [
              '2. Правьте на странице',
              'Клик по строке, «+ Текст», «Изображение», «✏ Рисовать» — всё в верхней панели.',
            ],
            [
              '3. Скачайте результат',
              'Кнопка «Скачать PDF» соберёт файл с изменениями прямо в браузере.',
            ],
          ].map(([title, text]) => (
            <div key={title} className="rounded-xl bg-white/70 p-4 ring-1 ring-zinc-200">
              <p className="text-xs font-semibold text-zinc-800">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">{text}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-relaxed text-emerald-800">
          <strong className="font-semibold">Приватность.</strong> Документы читаются и
          записываются в браузере: нет загрузки на сервер, нет аккаунта, нет телеметрии.
          Снимайте защиту только с тех файлов, на которые у вас есть права; пароль не подбирается.
        </div>

        <p className="mt-6 pb-2 text-center text-[11px] text-zinc-400">
          PDF Правка · MIT · автор Buffy (Freebuff coding agent)
        </p>
      </div>
    </div>
  )
}
