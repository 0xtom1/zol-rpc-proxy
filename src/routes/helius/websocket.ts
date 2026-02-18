import WebSocket, { type RawData } from 'ws'
import type { SocketStream } from '@fastify/websocket'
import type { FastifyRequest } from 'fastify'

const BUFFER_TIMEOUT_MS = 10000
const KEEPALIVE_INTERVAL_MS = 20000
const MAX_BUFFER_SIZE = 10

const KEEPALIVE_MESSAGE = JSON.stringify({
	jsonrpc: '2.0',
	method: 'helius_keepalive',
})

export function websocketHandler(connection: SocketStream, request: FastifyRequest): void {
	const socket = connection.socket

	const apiKey = process.env.HELIUS_API_KEY
	if (!apiKey) {
		socket.close(1011, 'Missing HELIUS_API_KEY')
		return
	}

	const url = new URL(request.url, 'http://localhost')
	const search = url.search
	const upstreamUrl = `wss://mainnet.helius-rpc.com${search ? `${search}&` : '?'}api-key=${apiKey}`

	// Extract subprotocol
	const clientProtocols = request.headers['sec-websocket-protocol']
	const selectedProtocol =
		typeof clientProtocols === 'string' ? clientProtocols.split(',')[0]?.trim() : undefined

	// Connect to upstream using ws client
	const upstream = selectedProtocol
		? new WebSocket(upstreamUrl, [selectedProtocol])
		: new WebSocket(upstreamUrl)

	// Message buffering for race condition fix
	let bufferedData: RawData[] = []
	let bufferTimeout: ReturnType<typeof setTimeout> | null = null
	let isUpstreamConnected = false

	// Keepalive management
	let keepaliveTimer: ReturnType<typeof setInterval> | null = null

	const startKeepalive = () => {
		keepaliveTimer = setInterval(() => {
			if (upstream.readyState === WebSocket.OPEN) {
				try {
					upstream.send(KEEPALIVE_MESSAGE)
				} catch {
					clearKeepalive()
				}
			} else {
				clearKeepalive()
			}
		}, KEEPALIVE_INTERVAL_MS)
	}

	const clearKeepalive = () => {
		if (keepaliveTimer) {
			clearInterval(keepaliveTimer)
			keepaliveTimer = null
		}
	}

	const clearBufferTimeout = () => {
		if (bufferTimeout) {
			clearTimeout(bufferTimeout)
			bufferTimeout = null
		}
	}

	const startBufferTimeout = () => {
		clearBufferTimeout()
		bufferTimeout = setTimeout(() => {
			if (bufferedData.length > 0 && !isUpstreamConnected) {
				bufferedData = []
				try {
					socket.close(1011, 'upstream_connection_timeout')
				} catch {}
			}
		}, BUFFER_TIMEOUT_MS)
	}

	const cleanup = () => {
		clearKeepalive()
		clearBufferTimeout()
		bufferedData = []
	}

	// Upstream connection open
	upstream.on('open', () => {
		isUpstreamConnected = true
		clearBufferTimeout()

		// Flush buffered messages
		if (bufferedData.length > 0) {
			try {
				for (const data of bufferedData) {
					upstream.send(data)
				}
				bufferedData = []
			} catch {
				cleanup()
				try {
					socket.close(1011, 'upstream_ws_error')
				} catch {}
				return
			}
		}
		startKeepalive()
	})

	// Client → upstream forwarding
	socket.on('message', (data: RawData) => {
		if (isUpstreamConnected && upstream.readyState === WebSocket.OPEN) {
			try {
				upstream.send(data)
			} catch {
				cleanup()
				try {
					socket.close(1011, 'upstream_ws_error')
				} catch {}
			}
		} else {
			if (bufferedData.length >= MAX_BUFFER_SIZE) {
				cleanup()
				try {
					socket.close(1011, 'buffer_overflow')
				} catch {}
				return
			}
			if (bufferedData.length === 0) {
				startBufferTimeout()
			}
			bufferedData.push(data)
		}
	})

	// Upstream → client forwarding
	upstream.on('message', (data: RawData) => {
		if (socket.readyState === WebSocket.OPEN) {
			try {
				socket.send(data)
			} catch {
				cleanup()
				try {
					upstream.close(1011, 'client_ws_error')
				} catch {}
			}
		}
	})

	// Close handling
	socket.on('close', () => {
		cleanup()
		try {
			upstream.close()
		} catch {}
	})

	upstream.on('close', () => {
		isUpstreamConnected = false
		cleanup()
		try {
			socket.close()
		} catch {}
	})

	// Error handling
	socket.on('error', () => {
		cleanup()
		try {
			upstream.close(1011, 'client_ws_error')
		} catch {}
	})

	upstream.on('error', () => {
		isUpstreamConnected = false
		cleanup()
		try {
			socket.close(1011, 'upstream_ws_error')
		} catch {}
	})
}
