import { toast } from 'sonner'

// An error toast says what went wrong and what to do next, often in two sentences, so it stays
// long enough for a slower reader; other toasts keep Sonner's 4 seconds.
export const ERROR_TOAST_DURATION_MS = 10_000

export function toastError(message: string) {
  return toast.error(message, { duration: ERROR_TOAST_DURATION_MS })
}
