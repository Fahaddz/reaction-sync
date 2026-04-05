import { createRouter as createTanStackRouter } from '@tanstack/react-router'

export async function getRouter() {
  const { routeTree } = await import('./routeTree.gen')
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0
  })

  return router
}
