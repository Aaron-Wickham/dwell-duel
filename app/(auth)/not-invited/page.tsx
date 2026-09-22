export default function NotInvitedPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-xl font-semibold">This app is invite-only</h1>
      <p className="text-sm text-foreground/70">
        Ask the admin to add your Gmail address, then try signing in again.
      </p>
    </div>
  )
}
