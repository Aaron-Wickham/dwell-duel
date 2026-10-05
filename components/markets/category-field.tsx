'use client'

import { Field, Input } from '@/components/ui/field'
import { filterChipClass } from '@/components/ui/filter-chips'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { categorySlug } from '@/lib/markets/categories'

// A market's category (0103): the browser's own suggestions as you type, from every visible
// category, and a chip for each of the most used. A name nobody has used yet makes a new category;
// one that differs only in case or spacing is the same one.
export function CategoryField({
  id,
  value,
  onChange,
  suggestions,
  popular,
  errorId,
  invalid = false,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  popular: string[]
  errorId: string
  invalid?: boolean
}) {
  const chosen = categorySlug(value)
  return (
    <Field label="Category" htmlFor={id} hint="Pick one or type your own.">
      <Input
        id={id}
        name="category"
        required
        list={`${id}-options`}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={TEXT_LIMITS.category}
        aria-invalid={invalid}
        aria-describedby={[`${id}-hint`, invalid ? errorId : null].filter(Boolean).join(' ')}
      />
      <datalist id={`${id}-options`}>
        {suggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      {popular.length > 0 && (
        <div role="group" aria-label="Most used categories" className="no-callout flex flex-wrap gap-2 pt-1">
          {popular.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={categorySlug(name) === chosen}
              onClick={() => onChange(name)}
              className={filterChipClass(categorySlug(name) === chosen)}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </Field>
  )
}
