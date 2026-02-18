import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import rateLimit from '@fastify/rate-limit'

const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
	await fastify.register(rateLimit, {
		max: 100,
		timeWindow: '1 minute',
		redis: fastify.redis,
	})
}

export default fp(rateLimitPlugin)
