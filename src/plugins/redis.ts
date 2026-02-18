import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { Redis } from 'ioredis'

declare module 'fastify' {
	interface FastifyInstance {
		redis: Redis
	}
}

const redisPlugin: FastifyPluginAsync = async (fastify) => {
	const host = process.env.REDIS_HOST
	if (!host) throw new Error('Missing REDIS_HOST')

	const client = new Redis({ host, lazyConnect: true })
	await client.connect()

	fastify.decorate('redis', client)

	fastify.addHook('onClose', async () => {
		await client.quit()
	})
}

export default fp(redisPlugin)
