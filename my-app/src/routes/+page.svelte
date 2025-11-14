<script lang="ts">
	let message = '';
	let streamedText = '';
	let isLoading = false;

	async function handleSubmit() {
		if (!message.trim()) return;

		isLoading = true;
		streamedText = '';
		const userMessage = message;
		message = '';

		try {
			const response = await fetch('/api/chat', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ message: userMessage })
			});

			if (!response.ok) {
				throw new Error('Failed to get response');
			}

			const reader = response.body?.getReader();
			const decoder = new TextDecoder();

			if (!reader) {
				throw new Error('No reader available');
			}

			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');

				// Keep the last incomplete line in the buffer
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.trim()) continue;

					try {
						const event = JSON.parse(line);

						// Handle different event types
						if (event.type === 'text-delta' || event.type === 'text') {
							streamedText += event.text || event.delta || '';
						}
					} catch (e) {
						console.error('Error parsing event:', e, line);
					}
				}
			}
		} catch (error) {
			console.error('Error:', error);
			streamedText = 'Error: Failed to get response';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="container">
	<h1>V0 Streaming Chat</h1>

	<div class="chat-container">
		{#if streamedText}
			<div class="response-box">
				<h3>Response:</h3>
				<div class="response-content">
					{streamedText}
				</div>
			</div>
		{/if}

		{#if isLoading}
			<div class="loading">Streaming response...</div>
		{/if}
	</div>

	<form on:submit|preventDefault={handleSubmit}>
		<div class="input-container">
			<input
				type="text"
				bind:value={message}
				placeholder="Type your message..."
				disabled={isLoading}
			/>
			<button type="submit" disabled={isLoading || !message.trim()}>
				Send
			</button>
		</div>
	</form>
</div>

<style>
	.container {
		max-width: 800px;
		margin: 0 auto;
		padding: 2rem;
		font-family: system-ui, -apple-system, sans-serif;
	}

	h1 {
		text-align: center;
		margin-bottom: 2rem;
		color: #333;
	}

	.chat-container {
		min-height: 400px;
		margin-bottom: 2rem;
		padding: 1rem;
		background: #f5f5f5;
		border-radius: 8px;
	}

	.response-box {
		background: white;
		padding: 1.5rem;
		border-radius: 8px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
		margin-bottom: 1rem;
	}

	.response-box h3 {
		margin-top: 0;
		color: #666;
		font-size: 0.9rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.response-content {
		line-height: 1.6;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.loading {
		text-align: center;
		color: #666;
		font-style: italic;
		padding: 1rem;
	}

	.input-container {
		display: flex;
		gap: 0.5rem;
	}

	input {
		flex: 1;
		padding: 0.75rem 1rem;
		border: 2px solid #ddd;
		border-radius: 8px;
		font-size: 1rem;
		transition: border-color 0.2s;
	}

	input:focus {
		outline: none;
		border-color: #4caf50;
	}

	input:disabled {
		background: #f5f5f5;
		cursor: not-allowed;
	}

	button {
		padding: 0.75rem 2rem;
		background: #4caf50;
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	}

	button:hover:not(:disabled) {
		background: #45a049;
	}

	button:disabled {
		background: #ccc;
		cursor: not-allowed;
	}
</style>
