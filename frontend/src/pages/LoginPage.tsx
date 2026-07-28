import { Link } from 'react-router-dom'
import { useAuth } from '../lib/authContext'
import { LoginForm } from '../components/LoginForm'
import { Button, buttonVariants } from '../components/ui/button'

export function LoginPage() {
  const { session, login, logout } = useAuth()

  if (session) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">
          You&apos;re already signed in as{' '}
          <span className="font-medium text-foreground">{session.user.email}</span>.
        </p>
        <div className="flex gap-2">
          <Link to="/" className={buttonVariants()}>
            Continue
          </Link>
          <Button type="button" variant="outline" onClick={() => logout()}>
            Log out & use a different account
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-6">
      <LoginForm onLogin={login} />
    </div>
  )
}
