'use client'

import { useState } from 'react'
import Form from 'next/form'
import { Field, Input, Select } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { SEARCH_MAX } from '@/lib/search/query'

export type LedgerFilterOption = { value: string; label: string }

// Admin › Ledger's filters (#418), kept in the URL's ?member= and ?kind=: a GET form that navigates
// in place and drops any "Show more" position, since a new filter starts the list from the newest.
// Member is a name the page resolves to one member's id (#430), so no load reads every member;
// while the box still shows the filtered member's name, the form sends their id, so filtering by
// kind as well never searches again. Kind stays a native select. Both are controlled, and
// re-keyed on the values, so they show what the page was rendered for, including after "Show
// everyone’s".
export function LedgerFilters(props: {
  kinds: LedgerFilterOption[]
  member: string
  memberId?: string
  kind: string
  memberErrorId?: string
}) {
  return <LedgerFilterForm key={`${props.memberId ?? props.member}|${props.kind}`} {...props} />
}

function LedgerFilterForm({
  kinds,
  member: initialMember,
  memberId,
  kind: initialKind,
  memberErrorId,
}: {
  kinds: LedgerFilterOption[]
  member: string
  memberId?: string
  kind: string
  memberErrorId?: string
}) {
  const [member, setMember] = useState(initialMember)
  const [kind, setKind] = useState(initialKind)
  const sendsId = Boolean(memberId) && member === initialMember

  return (
    <Form action="/admin/ledger" replace scroll={false} aria-label="Filter the ledger" className="flex flex-col gap-3 md:flex-row md:items-end">
      {sendsId && <input type="hidden" name="member" value={memberId} />}
      <Field label="Member" htmlFor="ledger-member" className="md:grow">
        {/* An empty value would still send ?member=, so an empty box (everyone) sends nothing at all. */}
        <Input
          id="ledger-member"
          name={member.trim() && !sendsId ? 'member' : undefined}
          type="search"
          value={member}
          onChange={(e) => setMember(e.target.value)}
          placeholder="Everyone"
          maxLength={SEARCH_MAX}
          autoComplete="off"
          aria-invalid={memberErrorId ? true : undefined}
          aria-describedby={memberErrorId}
        />
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
