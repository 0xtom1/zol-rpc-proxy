import type { FastifyRequest, FastifyReply } from 'fastify'

export async function rpcHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
	const apiKey = process.env.HELIUS_API_KEY
	if (!apiKey) {
		reply.code(500).send('Missing HELIUS_API_KEY')
		return
	}

	try {
		const url = new URL(request.url, 'http://localhost')
		// Strip the /helius prefix to get the upstream subpath
		const subpath = url.pathname.replace(/^\/helius/, '') || '/'
		const queryString = url.search

		const targetHost = subpath === '/' ? 'mainnet.helius-rpc.com' : 'api.helius.xyz'
		const targetUrl = `https://${targetHost}${subpath}?api-key=${apiKey}${queryString ? `&${queryString.slice(1)}` : ''}`

		// request.body is the raw string body (see addContentTypeParser in helius/index.ts)
		const payload = request.body as string | undefined

		const response = await fetch(targetUrl, {
			method: request.method,
			body: payload || null,
			headers: {
				'Content-Type': 'application/json',
				'X-Helius-Cloudflare-Proxy': 'true',
			},
		})

		const responseText = await response.text()
		reply.code(response.status).type('application/json').send(responseText)
	} catch {
		reply.code(502).send('Proxy Error')
	}
}
