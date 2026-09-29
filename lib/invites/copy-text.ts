// navigator.clipboard is missing on older iOS Safari and outside a secure context, so fall back to
// selecting a throwaway textarea and execCommand('copy'), which still works inside a click handler.
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Permission denied or no focus: the fallback may still work.
    }
  }
  return copyWithTextarea(text)
}

function copyWithTextarea(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.setAttribute('aria-hidden', 'true')
  // Off-screen rather than display:none, which can't be selected; 16px stops iOS zooming in.
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '-9999px'
  textarea.style.fontSize = '16px'
  document.body.appendChild(textarea)
  try {
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}
