import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import heliusRoutes from '../src/routes/helius/index.js'

async function buildApp() {
	const app = Fastify()
	await app.register(websocket)
	await app.register(heliusRoutes, { prefix: '/helius' })
	await app.ready()
	return app
}

function mockFetch(status: number, body: string) {
	return vi.fn().mockResolvedValue({
		status,
		text: async () => body,
	})
}

describe('RPC handler', () => {
	beforeEach(() => {
		process.env.HELIUS_API_KEY = 'test-key'
	})

	afterEach(() => {
		delete process.env.HELIUS_API_KEY
		vi.restoreAllMocks()
	})

	it('returns 500 when HELIUS_API_KEY is not set', async () => {
		delete process.env.HELIUS_API_KEY
		const app = await buildApp()
		const res = await app.inject({ method: 'POST', url: '/helius', body: '{}' })
		await app.close()
		expect(res.statusCode).toBe(500)
	})

	it('routes root path to mainnet.helius-rpc.com', async () => {
		const fetchMock = mockFetch(200, '{"result":"ok"}')
		vi.stubGlobal('fetch', fetchMock)
		const app = await buildApp()
		await app.inject({ method: 'POST', url: '/helius', body: '{}' })
		await app.close()
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining('mainnet.helius-rpc.com'),
			expect.any(Object),
		)
	})

	it('routes subpath to api.helius.xyz', async () => {
		const fetchMock = mockFetch(200, '{"result":"ok"}')
		vi.stubGlobal('fetch', fetchMock)
		const app = await buildApp()
		await app.inject({ method: 'POST', url: '/helius/v0/transactions', body: '{}' })
		await app.close()
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining('api.helius.xyz/v0/transactions'),
			expect.any(Object),
		)
	})

	it('includes api-key in upstream URL', async () => {
		const fetchMock = mockFetch(200, '{}')
		vi.stubGlobal('fetch', fetchMock)
		const app = await buildApp()
		await app.inject({ method: 'POST', url: '/helius', body: '{}' })
		await app.close()
		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining('api-key=test-key'),
			expect.any(Object),
		)
	})

	it('forwards upstream status code', async () => {
		vi.stubGlobal('fetch', mockFetch(429, '{"error":"rate limited"}'))
		const app = await buildApp()
		const res = await app.inject({ method: 'POST', url: '/helius', body: '{}' })
		await app.close()
		expect(res.statusCode).toBe(429)
	})

	it('returns 502 when fetch throws', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
		const app = await buildApp()
		const res = await app.inject({ method: 'POST', url: '/helius', body: '{}' })
		await app.close()
		expect(res.statusCode).toBe(502)
	})
})
