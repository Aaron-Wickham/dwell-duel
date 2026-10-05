'use client'

import { useActionState, useEffect, useState } from 'react'
import { Avatar } from '@/components/ui/avatar'
import { Button, buttonVariants } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { resizePhoto } from '@/lib/profile/resize-photo'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
import { updateProfileAction, type ActionState } from '@/lib/profile/update-profile'
import { labelClass } from '@/components/ui/page'
import { cardPaddingClass } from '@/components/ui/card'

type NewPhoto = { blob: Blob; preview: string }

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
    // One card, so a single Save plainly covers photo, name and bio (#397). The preview went:
    // the avatar beside Change photo already shows the new photo.
    <form action={formAction} className={`flex flex-col gap-5 rounded-card border border-line bg-surface ${cardPaddingClass} shadow-card`}>
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
    </form>
  )
}
