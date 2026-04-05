import { createFileRoute } from '@tanstack/react-router'
import { ReactionSyncApp } from '../components/reaction-sync-app'

export const Route = createFileRoute('/')({
  component: ReactionSyncHome
})

function ReactionSyncHome() {
  return <ReactionSyncApp />
}
