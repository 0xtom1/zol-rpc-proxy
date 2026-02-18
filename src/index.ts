import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import corsPlugin from './plugins/cors.js'
import heliusRoutes from './routes/helius/index.js'

const app = Fastify({ logger: true })

app.register(websocket)
app.register(corsPlugin)
app.register(heliusRoutes, { prefix: '/helius' })

const port = parseInt(process.env.PORT ?? '3000')
app.listen({ port, host: '0.0.0.0' }, (err) => {
	if (err) {
		app.log.error(err)
		process.exit(1)
	}
})
