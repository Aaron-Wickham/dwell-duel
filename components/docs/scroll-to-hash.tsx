'use client'

import { useEffect } from 'react'

// A link from another page to a section (Settings' Your data, the slip's How parlays pay) navigates
// on the client, and Next looks for the #id while loading.tsx's skeleton is showing, finds nothing,
// and leaves the page at the top. Once the doc itself has rendered, go to the section.
export function ScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (id) document.getElementById(id)?.scrollIntoView()
  }, [])
  return null
}
