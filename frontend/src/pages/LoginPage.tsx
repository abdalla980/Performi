import { Navigate } from 'react-router-dom'
import { useAuth } from '../lib/authContext'
import { LoginForm } from '../components/LoginForm'

export function LoginPage() {
  const { session, login } = useAuth()

  if (session) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-6">
      <LoginForm onLogin={login} />
    </div>
  )
}
