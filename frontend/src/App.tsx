import { useState } from 'react'
import { BriefForm } from './components/BriefForm'
import { CampaignReview } from './components/CampaignReview'
import { LaunchResult } from './components/LaunchResult'
import { LoginForm } from './components/LoginForm'
import type { ApiClient, BriefInput, GoogleCampaignPlan, LaunchResult as LaunchResultData } from './lib/types'

interface AppProps {
  apiClient: ApiClient
  onLogin: (email: string, password: string) => Promise<void>
  clientId: string
}

type Screen =
  | { name: 'login' }
  | { name: 'brief' }
  | { name: 'review'; draftId: string; plan: GoogleCampaignPlan }
  | { name: 'result'; result: LaunchResultData }

export function App({ apiClient, onLogin, clientId }: AppProps) {
  const [screen, setScreen] = useState<Screen>({ name: 'login' })

  const handleLogin = async (email: string, password: string) => {
    await onLogin(email, password)
    setScreen({ name: 'brief' })
  }

  const handleBriefSubmit = async (brief: BriefInput) => {
    const draft = await apiClient.submitBrief(brief)
    const generated = await apiClient.generateDraft(draft.id)
    if (!generated.googlePlan) {
      throw new Error('Generation did not return a campaign plan')
    }
    setScreen({ name: 'review', draftId: generated.id, plan: generated.googlePlan })
  }

  const handleLaunch = async () => {
    if (screen.name !== 'review') return
    const result = await apiClient.launchDraft(screen.draftId)
    setScreen({ name: 'result', result })
  }

  if (screen.name === 'login') {
    return <LoginForm onLogin={handleLogin} />
  }

  if (screen.name === 'brief') {
    return <BriefForm clientId={clientId} onSubmit={handleBriefSubmit} />
  }

  if (screen.name === 'review') {
    return <CampaignReview plan={screen.plan} onLaunch={handleLaunch} />
  }

  return <LaunchResult result={screen.result} />
}
