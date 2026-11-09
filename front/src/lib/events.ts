// Registro de eventos de la sesión: muestra en la UI el flujo EDA (API -> SNS -> SQS -> worker).
import { useSyncExternalStore } from 'react'

export type Channel = 'API' | 'SNS' | 'SQS' | 'S3' | 'AUTH'

export interface FsmEvent {
  id: string
  at: string
  channel: Channel
  type: string
  detail: string
}

let events: FsmEvent[] = []
const listeners = new Set<() => void>()
let seq = 0

export function emitEvent(e: Omit<FsmEvent, 'id' | 'at'>) {
  seq++
  events = [{ ...e, id: `evt-${Date.now()}-${seq}`, at: new Date().toISOString() }, ...events].slice(0, 200)
  listeners.forEach((l) => l())
}

export function clearEvents() {
  events = []
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useEvents(): FsmEvent[] {
  return useSyncExternalStore(subscribe, () => events)
}
