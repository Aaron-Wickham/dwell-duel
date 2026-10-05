'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Menu } from '@base-ui/react/menu'
import { Mail, Settings, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react'
import { AttentionCount } from '@/components/ui/attention-badge'
import { Avatar } from '@/components/ui/avatar'
import { uiTextClass } from '@/components/ui/page'
import { feedbackHref } from '@/lib/app-shell/feedback'
import { cn } from '@/lib/utils'

export type NavMember = { id: string; name: string; avatarSrc: string | null }

const itemClass = `flex min-h-11 items-center gap-3 rounded-segment px-3 ${uiTextClass} font-bold text-ink no-underline outline-none select-none data-highlighted:bg-sunk`

function Item({ href, icon: Icon, external = false, children }: { href: string; icon: LucideIcon; external?: boolean; children: ReactNode }) {
  return (
    <Menu.LinkItem
      closeOnClick
      className={itemClass}
      render={external ? <a href={href} /> : <Link href={href} transitionTypes={['nav-forward']} />}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0 text-ink2" />
      {children}
    </Menu.LinkItem>
  )
}

// The avatar opens your profile, Settings, Admin and feedback (#385). With work waiting on a
// reviewer or above, a red dot marks the avatar and its name says how much; the Admin item says
// it again in words.
export function ProfileMenu({
  me,
  active,
  adminHref,
  attention,
}: {
  me: NavMember
  // On your own profile or Settings, where the avatar was the way in.
  active: boolean
  adminHref: string | null
  attention: number
}) {
  const waiting = adminHref ? attention : 0
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger
        aria-label={waiting > 0 ? `Your profile and settings, ${waiting} waiting` : 'Your profile and settings'}
        className="pressable relative inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full"
      >
        <span
          className={cn(
            'flex size-9 items-center justify-center rounded-full',
            active && 'ring-2 ring-nav-active ring-offset-2 ring-offset-surface',
          )}
        >
          <Avatar name={me.name} src={me.avatarSrc} size="nav" />
        </span>
        {waiting > 0 && <span aria-hidden="true" className="absolute top-1 right-1 size-2.5 rounded-full bg-loss ring-2 ring-surface" />}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" className="z-40 outline-none">
          <Menu.Popup className="flex min-w-60 origin-(--transform-origin) flex-col gap-0.5 rounded-tile border border-line bg-surface p-1.5 text-ink shadow-overlay outline-none transition-[opacity,scale] duration-(--duration-fast) data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 motion-reduce:transition-none">
            <Item href={`/members/${me.id}`} icon={UserRound}>
              Your profile
            </Item>
            <Item href="/settings" icon={Settings}>
              Settings
            </Item>
            {adminHref && (
              <Item href={adminHref} icon={ShieldCheck}>
                <span className="grow">Admin</span>
                <AttentionCount count={waiting} />
              </Item>
            )}
            <Menu.Separator className="mx-2 my-1 h-px bg-line" />
            <Item href={feedbackHref()} icon={Mail} external>
              Send feedback
            </Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
