'use client'

import { useState } from 'react'
import Form from 'next/form'
import { Field, Select } from '@/components/ui/field'
import { Button } from '@/components/ui/button'

export type LedgerFilterOption = { value: string; label: string }

// Admin › Ledger's filters (#418), kept in the URL's ?member= and ?kind=: a GET form that navigates
// in place and drops any "Show more" position, since a new filter starts the list from the newest.
// The selects stay native; controlled, and re-keyed on the values, so they show what the page was
// rendered for, including after "Show everyone’s".
export function LedgerFilters(props: { members: LedgerFilterOption[]; kinds: LedgerFilterOption[]; member: string; kind: string }) {
  return <LedgerFilterForm key={`${props.member}|${props.kind}`} {...props} />
}

function LedgerFilterForm({
  members,
  kinds,
  member: initialMember,
  kind: initialKind,
}: {
  members: LedgerFilterOption[]
  kinds: LedgerFilterOption[]
  member: string
  kind: string
}) {
  const [member, setMember] = useState(initialMember)
  const [kind, setKind] = useState(initialKind)

  return (
    <Form action="/admin/ledger" replace scroll={false} aria-label="Filter the ledger" className="flex flex-col gap-3 md:flex-row md:items-end">
      <Field label="Member" htmlFor="ledger-member" className="md:grow">
        {/* An empty value would still send ?member=, so "Everyone" sends nothing at all. */}
        <Select id="ledger-member" name={member ? 'member' : undefined} value={member} onChange={(e) => setMember(e.target.value)}>
          <option value="">Everyone</option>
          {members.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Kind" htmlFor="ledger-kind" className="md:grow">
        <Select id="ledger-kind" name={kind ? 'kind' : undefined} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Every kind</option>
          {kinds.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" variant="secondary" className="shrink-0">
        Filter
      </Button>
    </Form>
  )
}
