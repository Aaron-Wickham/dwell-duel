import type { ReactNode } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { h1Class } from '@/components/ui/page'

// The member page's photo, name and bio.
export function MemberProfileHeader({
  name,
  avatarSrc,
  bio,
  children,
}: {
  name: string
  avatarSrc: string | null
  bio: string | null
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 md:gap-5">
        <Avatar name={name} src={avatarSrc} size="lg" />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className={`${h1Class} break-words`}>{name}</h1>
          {children}
        </div>
      </div>
      {bio && <p className="whitespace-pre-line break-words">{bio}</p>}
    </div>
  )
}
