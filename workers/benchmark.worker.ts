self.onmessage = (event: MessageEvent) => {
  const { type, buffer, sentAt } = event.data
	
	const receivedAt = performance.now()
	const transferDuration = receivedAt - sentAt
	
	if (type === 'STRUCTURED_CLONE') {
		self.postMessage({
			type: 'CLONE_RESULT',
			byteLength: buffer.byteLength,
			transferDuration
		})
	}

	if (type === 'TRANSFERABLE') {
		self.postMessage({
			type: 'TRANSFER_RESULT',
			byteLength: buffer.byteLength,
			transferDuration
		}, [buffer])
	}
}
