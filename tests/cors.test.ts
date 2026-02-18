import { describe, it, expect, afterEach } from 'vitest'
import Fastify from 'fastify'
import corsPlugin from '../src/plugins/cors.js'

function buildApp(corsAllowOrigin?: string) {
	if (corsAllowOrigin !== undefined) {
		process.env.CORS_ALLOW_ORIGIN = corsAllowOrigin
	} else {
		delete process.env.CORS_ALLOW_ORIGIN
	}
	const app = Fastify()
	app.register(corsPlugin)
	app.get('/test', async () => ({ ok: true }))
	return app
}

describe('CORS plugin', () => {
	afterEach(() => {
		delete process.env.CORS_ALLOW_ORIGIN
	})

	it('sets wildcard when CORS_ALLOW_ORIGIN is not set', async () => {
		const app = buildApp()
		const res = await app.inject({
			method: 'GET',
			url: '/test',
			headers: { origin: 'https://example.com' },
		})
		expect(res.headers['access-control-allow-origin']).toBe('*')
	})

	it('sets matching origin when in allowlist', async () => {
		const app = buildApp('https://example.com,https://other.com')
		const res = await app.inject({
			method: 'GET',
			url: '/test',
			headers: { origin: 'https://example.com' },
		})
		expect(res.headers['access-control-allow-origin']).toBe('https://example.com')
	})

	it('does not set origin header when not in allowlist', async () => {
		const app = buildApp('https://allowed.com')
		const res = await app.inject({
			method: 'GET',
			url: '/test',
			headers: { origin: 'https://blocked.com' },
		})
		expect(res.headers['access-control-allow-origin']).toBeUndefined()
	})

	it('trims whitespace in comma-separated origins', async () => {
		const app = buildApp('https://a.com , https://b.com')
		const res = await app.inject({
			method: 'GET',
			url: '/test',
			headers: { origin: 'https://b.com' },
		})
		expect(res.headers['access-control-allow-origin']).toBe('https://b.com')
	})

	it('returns 200 for OPTIONS preflight', async () => {
		const app = buildApp()
		const res = await app.inject({ method: 'OPTIONS', url: '/test' })
		expect(res.statusCode).toBe(200)
	})

	it('sets Allow-Methods and Allow-Headers on all responses', async () => {
		const app = buildApp()
		const res = await app.inject({ method: 'GET', url: '/test' })
		expect(res.headers['access-control-allow-methods']).toBe('GET, HEAD, POST, PUT, OPTIONS')
		expect(res.headers['access-control-allow-headers']).toBe('Content-Type, Authorization')
	})
})
