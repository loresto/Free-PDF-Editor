export interface Env {
  ASSETS: Fetcher
}

/** Static build: the Worker only serves the assets produced by Vite. */
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.ASSETS.fetch(request)
  },
}
