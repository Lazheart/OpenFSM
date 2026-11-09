import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import type { Tone } from '../lib/format'

interface Toast {
  id: number
  tone: Tone
  title: string
  detail?: string
}

type Push = (t: Omit<Toast, 'id'>) => void
const Ctx = createContext<Push>(() => {})
let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback<Push>((t) => {
    const id = nextId++
    setToasts((prev) => [...prev, { ...t, id }].slice(-4))
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), t.tone === 'danger' ? 7000 : 4000)
  }, [])

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <strong>{t.title}</strong>
            {t.detail && <span>{t.detail}</span>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
