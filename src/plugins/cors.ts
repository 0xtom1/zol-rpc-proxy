import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'

const corsPlugin: FastifyPluginAsync = async (fastify) => {
	const corsAllowOrigin = process.env.CORS_ALLOW_ORIGIN
	const supportedDomains = corsAllowOrigin
		?.split(',')
		.map((d) => d.trim())
		.filter(Boolean)

	fastify.addHook('onRequest', async (request, reply) => {
		const origin = request.headers.origin

		if (supportedDomains && supportedDomains.length > 0) {
			if (origin && supportedDomains.includes(origin)) {
				reply.header('Access-Control-Allow-Origin', origin)
			}
		} else {
			reply.header('Access-Control-Allow-Origin', '*')
		}

		reply.header('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, OPTIONS')
		reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

		if (request.method === 'OPTIONS') {
			reply.code(200).send()
		}
	})
}

export default fp(corsPlugin)
