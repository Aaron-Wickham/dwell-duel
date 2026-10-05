'use client'

import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { haptics } from '@/lib/haptics'
import { copyText } from '@/lib/invites/copy-text'
import { inviteMessage } from '@/lib/invites/invite-message'
import { cn } from '@/lib/utils'

export function CopyInviteButton({ email, className }: { email: string; className?: string }) {
  async function copy() {
    if (await copyText(inviteMessage(email))) {
      toast.success('Invite message copied.')
      haptics.success()
    } else {
      toast.error('Couldn’t copy the invite message. Try again.')
      haptics.error()
    }
  }

  return (
    // Named by aria-label, like Revoke: the e2e suite finds the invite by its email, which must
    // appear as text only once.
    <Button
      variant="secondary"
      size="sm"
      className={cn('shrink-0', className)}
      aria-label={`Copy invite message for ${email}`}
      onClick={copy}
    >
      Copy invite message
    </Button>
  )
}
