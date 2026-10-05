import { describe, it, expect } from 'vitest'
import { nextOrder, orderLabel, orderParams, readMemberOrder } from '@/lib/members/member-sort'

// #418: Admin › Members' sort lives in ?sort= and ?dir=.
describe('member sort', () => {
  it('reads A–Z by default and for anything it doesn’t know', () => {
    expect(readMemberOrder({}, false)).toEqual({ sort: 'name', dir: 'asc' })
    expect(readMemberOrder({ sort: 'email' }, false)).toEqual({ sort: 'name', dir: 'asc' })
    expect(readMemberOrder({ sort: 'name', dir: 'desc' }, false)).toEqual({ sort: 'name', dir: 'asc' })
  })

  it('sorts figures highest first and the newest member first unless asked otherwise', () => {
    expect(readMemberOrder({ sort: 'balance' }, false)).toEqual({ sort: 'balance', dir: 'desc' })
    expect(readMemberOrder({ sort: 'joined', dir: 'asc' }, true)).toEqual({ sort: 'joined', dir: 'asc' })
    expect(readMemberOrder({ sort: 'net_worth', dir: 'sideways' }, false)).toEqual({ sort: 'net_worth', dir: 'desc' })
  })

  it('falls back to A–Z for net worth on the Removed tab', () => {
    expect(readMemberOrder({ sort: 'net_worth' }, true)).toEqual({ sort: 'name', dir: 'asc' })
  })

  it('turns the sorted column round, and starts another in its first direction', () => {
    expect(nextOrder({ sort: 'balance', dir: 'desc' }, 'balance')).toEqual({ sort: 'balance', dir: 'asc' })
    expect(nextOrder({ sort: 'balance', dir: 'asc' }, 'joined')).toEqual({ sort: 'joined', dir: 'desc' })
    expect(nextOrder({ sort: 'joined', dir: 'asc' }, 'name')).toEqual({ sort: 'name', dir: 'asc' })
  })

  it('leaves the defaults out of the URL', () => {
    expect(orderParams({ sort: 'name', dir: 'asc' })).toEqual({ sort: null, dir: null })
    expect(orderParams({ sort: 'balance', dir: 'desc' })).toEqual({ sort: 'balance', dir: null })
    expect(orderParams({ sort: 'balance', dir: 'asc' })).toEqual({ sort: 'balance', dir: 'asc' })
    expect(orderLabel({ sort: 'net_worth', dir: 'asc' })).toBe('lowest net worth first')
  })
})
