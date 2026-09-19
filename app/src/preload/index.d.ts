import type { HighchemAPI } from './index'

declare global {
  interface Window {
    highchem: HighchemAPI
  }
}

export {}
