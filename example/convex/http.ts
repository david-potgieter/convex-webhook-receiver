import { httpRouter } from 'convex/server'
import { route as githubRoute } from './webhooks/github'
import { route as stripeRoute } from './webhooks/stripe'
import { route as slackRoute } from './webhooks/slack'

const http = httpRouter()

http.route(githubRoute)
http.route(stripeRoute)
http.route(slackRoute)

export default http
