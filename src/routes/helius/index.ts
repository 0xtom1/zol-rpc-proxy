import type { FastifyPluginAsync } from 'fastify'
import { rpcHandler } from './rpc'
import { websocketHandler } from './websocket'

const heliusRoutes: FastifyPluginAsync = async (fastify) => {
	// Pass raw body string to rpcHandler for transparent proxying
	fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
		done(null, body)
	})
	fastify.addContentTypeParser('*', { parseAs: 'string' }, (_req, body, done) => {
		done(null, body)
	})

	// WebSocket proxy
	fastify.get('/', { websocket: true }, websocketHandler)

	// HTTP RPC proxy — root maps to mainnet.helius-rpc.com, subpaths to api.helius.xyz
	fastify.post('/', rpcHandler)
	fastify.post('/*', rpcHandler)
}

export default heliusRoutes
