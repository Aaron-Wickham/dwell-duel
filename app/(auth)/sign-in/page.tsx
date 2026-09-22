import { Suspense } from 'react'
import { SignInButton } from './sign-in-button'

export default function SignInPage() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Suspense>
        <SignInButton />
      </Suspense>
    </div>
  )
}
