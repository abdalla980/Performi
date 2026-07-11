import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '../lib/apiClientContext'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

export function NewClientPage() {
  const apiClient = useApiClient()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: () => apiClient.createClient(name),
    onSuccess: async (client) => {
      await queryClient.invalidateQueries({ queryKey: ['clients'] })
      navigate(`/clients/${client.id}`)
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create client.'),
  })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    createMutation.mutate()
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Add client</CardTitle>
        <CardDescription>Create a client to start submitting campaign briefs for them.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="client-name">Client name</Label>
            <Input id="client-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" disabled={!name.trim() || createMutation.isPending} className="self-start">
            {createMutation.isPending ? 'Creating…' : 'Create client'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
