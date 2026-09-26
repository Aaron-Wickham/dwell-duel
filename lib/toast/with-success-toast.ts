import { toast } from 'sonner'

// The toast fires from the action itself once it resolves, not from an effect watching the
// form's pending state: some forms (the void card, "Add to parlay") unmount in the same render
// that ends that state, so an effect inside them never runs. sonner's toast is global, so a call
// made here outlives the form.
export function withSuccessToast<State, Payload>(
  action: (state: State, payload: Payload) => Promise<State>,
  hasError: (state: State) => boolean,
  message: string,
): (state: State, payload: Payload) => Promise<State> {
  return async (state, payload) => {
    const next = await action(state, payload)
    if (!hasError(next)) toast.success(message)
    return next
  }
}
