// React resets a form once its action finishes, even when the action returned an error. A
// controlled text field survives it, since React keeps its default value in step with its value,
// but a checkbox, radio or select falls back to its default, and React doesn't put it back
// because its value hasn't changed. These ref callbacks keep that default in step as well, so the
// reset has nothing to undo.
export function keepCheckedOnReset(checked: boolean) {
  return (input: HTMLInputElement | null) => {
    if (input) input.defaultChecked = checked
  }
}

export function keepSelectedOnReset(value: string) {
  return (select: HTMLSelectElement | null) => {
    if (!select) return
    for (const option of select.options) option.defaultSelected = option.value === value
  }
}
