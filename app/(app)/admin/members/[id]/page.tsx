import { Suspense } from 'react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { CircleDot } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { atLeast, getRole } from '@/lib/auth/roles'
import { getAdminMember } from '@/lib/members/list-members'
import { isUuid } from '@/lib/uuid'
import { Page, uiTextClass } from '@/components/ui/page'
import { BackLink } from '@/components/ui/back-link'
import { SectionCard } from '@/components/ui/section-card'
import { SkeletonScreen } from '@/components/ui/skeleton'
import { MemberProfileHeader } from '@/components/members/member-profile-header'
import { AdjustBalanceForm } from '../adjust-balance-form'
import { MemberActivity } from '../member-activity'
import { MemberChip } from '../member-chip'
import { ReinviteMemberButton } from '../reinvite-member-button'
import { RemoveMemberButton } from '../remove-member-button'
import { RoleForm } from '../role-form'
import { CoinHistory, CoinHistorySkeleton } from './coin-history'
import { formatDcAmount } from '@/lib/format/dc'

// One member's Admin page, where the owner's forms for them live (#254). Outside the Admin
// sections' layout, so the member's name is the page's heading. No loading.tsx: the member must be
// found before anything streams, so an unknown id still gets a real 404 status; the coin history
// streams in behind its skeleton.
export default async function AdminMemberPage(props: PageProps<'/admin/members/[id]'>) {
  const { id } = await props.params
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  const role = await getRole(supabase)
  if (!atLeast(role, 'admin')) redirect(atLeast(role, 'reviewer') ? '/admin/tasks' : '/')
  if (!isUuid(id)) notFound()

  const member = await getAdminMember(supabase, id)
  if (!member) notFound()
  // Balances, roles and access are the owner's alone (0040, 0068); admins see who's who.
  const isOwner = role === 'owner'
  const canChangeAccess = isOwner && member.role !== 'owner' && member.id !== user.id
  // A Server Component renders once per request, so the purity rule's re-render worry doesn't
  // apply; passing this down keeps "2h ago" the same on the server and at hydration.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  return (
    <Page transition="drill-down">
      <BackLink href="/admin/members">Members</BackLink>
      <div className="flex flex-col gap-5 md:gap-7 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5 md:gap-7">
          <MemberProfileHeader name={member.displayName} avatarSrc={member.avatarSrc} bio={null}>
            <p className="text-sm text-ink2 wrap-anywhere">
              {member.email}
              {' · '}
              <MemberActivity joinedAt={member.joinedAt} lastSignInAt={member.lastSignInAt} now={now} />
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-gold-soft pr-3 pl-2 ${uiTextClass} font-extrabold tabular-nums text-gold`}>
                <CircleDot aria-hidden="true" className="size-[18px]" />
                {formatDcAmount(member.balance)}
              </span>
              <MemberChip member={member} />
              <Link href={`/members/${member.id}`} transitionTypes={['nav-forward']} className="hit-area text-sm font-bold">
                Public profile
              </Link>
            </div>
          </MemberProfileHeader>
          {isOwner && (
            <SectionCard title="Adjust balance" titleId="adjust-balance" description="Owner only. Shows in the ledger with your reason.">
              <AdjustBalanceForm member={member} />
            </SectionCard>
          )}
          {isOwner && member.role !== 'owner' && !member.removed && (
            <SectionCard title="Role" titleId="role">
              <RoleForm member={member} />
            </SectionCard>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-5 md:gap-7">
          <Suspense
            fallback={
              <SkeletonScreen name="admin-member-coins">
                <CoinHistorySkeleton />
              </SkeletonScreen>
            }
          >
            <CoinHistory memberId={member.id} />
          </Suspense>
          {canChangeAccess && (
            <SectionCard
              title="Access"
              titleId="access"
              description={
                member.removed
                  ? 'Removed: they can’t sign in and aren’t ranked. Inviting them again brings them back as a Member.'
                  : 'Removing takes away their invite and any role straight away. Their coins, bets and history stay.'
              }
            >
              {member.removed ? <ReinviteMemberButton member={member} /> : <RemoveMemberButton member={member} />}
            </SectionCard>
          )}
        </div>
      </div>
    </Page>
  )
}
