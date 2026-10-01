'use client'

import { useActionState, useEffect, useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Button, buttonVariants } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { SectionCard } from '@/components/ui/section-card'
import { MemberProfileHeader } from '@/components/members/member-profile-header'
import { cn } from '@/lib/utils'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { resizePhoto } from '@/lib/profile/resize-photo'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { updateProfileAction, type ActionState } from '@/lib/profile/update-profile'
import { labelClass } from '@/components/ui/page'

type NewPhoto = { blob: Blob; preview: string }

const lgCard = 'lg:flex lg:flex-col lg:gap-5 lg:rounded-card lg:border lg:border-line lg:bg-surface lg:p-6 lg:shadow-card'

export function ProfileForm({
  displayName,
  bio,
  avatarSrc,
}: {
  displayName: string
  bio: string
  avatarSrc: string | null
}) {
  const [name, setName] = useState(displayName)
  const [bioText, setBioText] = useState(bio)
  const [photo, setPhoto] = useState<NewPhoto | null>(null)
  const [removed, setRemoved] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.preview)
  }, [photo])

  const [state, formAction] = useActionState<ActionState, FormData>(
    withSuccessToast(
      async (prev: ActionState, formData: FormData) => {
        // The file input has no name, so the original photo never uploads; only the resized one.
        if (photo) formData.set('avatar', photo.blob, 'avatar.jpg')
        if (removed) formData.set('remove_avatar', 'on')
        const next = await updateProfileAction(prev, formData)
        if (next?.saved) {
          setPhoto(null)
          setRemoved(false)
        }
        return next
      },
      (s) => Boolean(s?.formError),
      'Profile saved.',
    ),
    undefined,
  )

  async function choosePhoto(file: File | undefined) {
    setPhotoError(null)
    if (!file) return
    try {
      const blob = await resizePhoto(file)
      setPhoto({ blob, preview: URL.createObjectURL(blob) })
      setRemoved(false)
    } catch {
      setPhotoError('That photo couldn’t be read. Try a JPEG or PNG.')
    }
  }

  const shownSrc = photo?.preview ?? (removed ? null : avatarSrc)
  const errorFor = (field: NonNullable<ActionState>['field']) => (state?.field === field ? 'profile-error' : undefined)
  const avatarErrorId = photoError ? 'profile-photo-error' : errorFor('avatar')

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-card border border-line bg-surface p-[18px] shadow-card md:p-6 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
    >
      {/* One card on a phone; at lg the photo and preview sit in cards beside a card of fields. */}
      <div className="contents lg:flex lg:flex-col lg:gap-5">
        {/* The card goes on a wrapper: a bordered fieldset would draw its legend into the border. */}
        <div className={cn('contents', lgCard)}>
          <fieldset className="flex flex-col gap-3" aria-describedby={avatarErrorId}>
            <legend className={`mb-1.5 ${labelClass}`}>Photo</legend>
            <div className="flex flex-wrap items-center gap-4">
              <Avatar name={name || displayName} src={shownSrc} size="lg" />
              <div className="flex flex-wrap gap-2">
                <input
                  id="pf-photo"
                  type="file"
                  accept="image/*"
                  className="peer sr-only"
                  onChange={(e) => {
                    void choosePhoto(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
                <label
                  htmlFor="pf-photo"
                  className={`${buttonVariants({ variant: 'secondary', size: 'sm' })} peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus`}
                >
                  {shownSrc ? 'Change photo' : 'Choose photo'}
                </label>
                {shownSrc && (
                  <Button
                    variant="quiet"
                    size="sm"
                    onClick={() => {
                      setPhoto(null)
                      setRemoved(Boolean(avatarSrc))
                      setPhotoError(null)
                    }}
                  >
                    Remove photo
                  </Button>
                )}
              </div>
            </div>
            {!shownSrc && <p className="text-sm text-ink2">Without a photo, your initial shows instead.</p>}
            {photoError && (
              <Message tone="error" id="profile-photo-error">
                {photoError}
              </Message>
            )}
          </fieldset>
        </div>

        <SectionCard
          title="Preview"
          titleId="profile-preview-title"
          description="How your profile looks to other members."
          className="hidden lg:flex"
        >
          <MemberProfileHeader name={name.trim() || displayName} avatarSrc={shownSrc} bio={bioText.trim() || null} heading={false} />
        </SectionCard>
      </div>

      <div className={cn('contents', lgCard)}>
        <Field label="Display name" htmlFor="pf-name">
          <Input
            id="pf-name"
            name="display_name"
            required
            maxLength={TEXT_LIMITS.displayName}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="nickname"
            aria-invalid={state?.field === 'display_name'}
            aria-describedby={errorFor('display_name')}
          />
        </Field>

        <Field label="Bio" htmlFor="pf-bio" hint={`Optional. Up to ${TEXT_LIMITS.bio} characters, shown on your profile.`}>
          <Textarea
            id="pf-bio"
            name="bio"
            value={bioText}
            onChange={(e) => setBioText(e.target.value)}
            maxLength={TEXT_LIMITS.bio}
            aria-invalid={state?.field === 'bio'}
            aria-describedby={['pf-bio-hint', errorFor('bio')].filter(Boolean).join(' ')}
          />
        </Field>

        {state?.formError && (
          <Message tone="error" id="profile-error">
            {state.formError}
          </Message>
        )}

        <FormSubmitButton block className="md:w-auto md:self-start">
          Save profile
        </FormSubmitButton>
      </div>
    </form>
  )
}
