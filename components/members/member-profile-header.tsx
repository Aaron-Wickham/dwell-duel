import type { ReactNode } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { h1Class } from '@/components/ui/page'

// The member page's photo, name and bio. Edit profile shows the same block as a live preview,
// where the name can't be the page's heading, so `heading` is off there.
export function MemberProfileHeader({
  name,
  avatarSrc,
  bio,
  heading = true,
  children,
}: {
  name: string
  avatarSrc: string | null
  bio: string | null
  heading?: boolean
  children?: ReactNode
}) {
  const Name = heading ? 'h1' : 'p'
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 md:gap-5">
        <Avatar name={name} src={avatarSrc} size="lg" />
        <div className="flex min-w-0 flex-col gap-1">
          <Name className={`${h1Class} break-words`}>{name}</Name>
          {children}
        </div>
      </div>
      {bio && <p className="whitespace-pre-line break-words">{bio}</p>}
    </div>
  )
}
