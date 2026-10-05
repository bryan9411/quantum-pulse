const ctx: Worker = self as unknown as Worker

ctx.onmessage = (event: MessageEvent) => {
  const { type, buffer, sentAt } = event.data
	
	const receivedAt = performance.now()
	const transferDuration = receivedAt - sentAt
	
	if (type === 'STRUCTURED_CLONE') {
		ctx.postMessage({
			type: 'CLONE_RESULT',
			byteLength: buffer.byteLength,
			transferDuration
		})
	}

	if (type === 'TRANSFERABLE') {
		ctx.postMessage({
			type: 'TRANSFER_RESULT',
			byteLength: buffer.byteLength,
			transferDuration
		}, [buffer])
	}
}
