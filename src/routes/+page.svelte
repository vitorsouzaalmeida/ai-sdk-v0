<script lang="ts">
	import MessageRenderer from '$lib/MessageRenderer.svelte';
	import type { V0ToolArgs, ToolCallResult } from '$lib/types';
	import type { MessageBinaryFormat } from '$lib/v0-stream-parser';

	type ToolCall = {
		toolCallId: string;
		toolName: string;
		args: V0ToolArgs | Record<string, unknown>;
		status: 'pending' | 'streaming' | 'completed' | 'error';
		result?: ToolCallResult;
		error?: string;
		isStreaming?: boolean;
	};

	type ChatMessage = {
		role: 'user' | 'assistant';
		content: string;
		toolCalls?: ToolCall[];
	};

	const isV0MessageBinaryFormat = (result: unknown): result is MessageBinaryFormat => {
		return Array.isArray(result) && result.length > 0 && Array.isArray(result[0]);
	};

	let message = $state('');
	let isLoading = $state(false);
	let chatHistory: ChatMessage[] = $state([]);
	let currentToolCalls: ToolCall[] = $state([]);

	const handleSubmit = async () => {
		if (!message.trim()) return;

		const userMessage = message;
		message = '';

		chatHistory = [
			...chatHistory,
			{
				role: 'user',
				content: userMessage
			}
		];

		isLoading = true;
		currentToolCalls = [];

		try {
			const response = await fetch('/api/chat', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					message: userMessage
				})
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

				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.trim()) continue;

					try {
						const event = JSON.parse(line);

						if (event.type === 'text-delta' || event.type === 'text') {
							// ignore
						} else if (event.type === 'tool-call') {
							const existingIndex = currentToolCalls.findIndex(
								(tc) => tc.toolCallId === event.toolCallId
							);
							const toolCall: ToolCall = {
								toolCallId: event.toolCallId,
								toolName: event.toolName,
								args: event.args,
								status: 'pending'
							};

							if (existingIndex >= 0) {
								currentToolCalls[existingIndex] = toolCall;
							} else {
								currentToolCalls = [...currentToolCalls, toolCall];
							}
						} else if (event.type === 'tool-result-delta') {
							const index = currentToolCalls.findIndex((tc) => tc.toolCallId === event.toolCallId);
							if (index >= 0) {
								const content = event.delta?.content || event.delta;

								currentToolCalls[index] = {
									...currentToolCalls[index],
									status: 'streaming',
									result: content,
									isStreaming: true
								};
								currentToolCalls = [...currentToolCalls];
							}
						} else if (event.type === 'tool-result') {
							const index = currentToolCalls.findIndex((tc) => tc.toolCallId === event.toolCallId);
							if (index >= 0) {
								const content =
									event.output?.content || event.result?.content || event.output || event.result;

								const isStreaming = event.preliminary === true;

								currentToolCalls[index] = {
									...currentToolCalls[index],
									status: isStreaming ? 'streaming' : event.error ? 'error' : 'completed',
									result: content !== null ? content : currentToolCalls[index].result,
									error: event.error,
									isStreaming: isStreaming
								};
								currentToolCalls = [...currentToolCalls];
							}
						}
					} catch (e) {
						console.error('Error parsing event:', e, line);
					}
				}
			}
		} catch (error) {
			console.error('Error:', error);
			chatHistory = [
				...chatHistory,
				{
					role: 'assistant',
					content: 'Error: Failed to get response'
				}
			];
		} finally {
			isLoading = false;
			currentToolCalls = [];
		}
	};
</script>

<div class="mx-auto max-w-[900px] p-8 font-sans">
	<div class="mb-8">
		<h1 class="m-0 text-3xl text-gray-800">V0 Streaming Chat</h1>
	</div>

	<div class="mb-8 flex min-h-[400px] flex-col gap-4 overflow-x-hidden rounded-lg bg-gray-100 p-4">
		{#each chatHistory as msg, index (index)}
			{#if msg.role === 'user'}
				<div class="flex max-w-full items-start gap-3">
					<div
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500 text-sm font-semibold text-white"
					>
						U
					</div>
					<div class="min-w-0 flex-1 rounded-lg bg-white p-4 wrap-break-word shadow-sm">
						<div class="leading-relaxed wrap-break-word whitespace-pre-wrap text-gray-800">
							{msg.content}
						</div>
					</div>
				</div>
			{:else}
				<div class="flex max-w-full items-start gap-3">
					<div
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500 text-sm font-semibold text-white"
					>
						AI
					</div>
					<div class="min-w-0 flex-1 rounded-lg bg-white p-4 wrap-break-word shadow-sm">
						{#if msg.toolCalls && msg.toolCalls.length > 0}
							{#each msg.toolCalls as toolCall (toolCall.toolCallId)}
								{#if (toolCall.status === 'streaming' || toolCall.status === 'completed') && toolCall.result}
									{#if isV0MessageBinaryFormat(toolCall.result)}
										<MessageRenderer messageBinaryFormat={toolCall.result} />
									{/if}
								{/if}

								{#if toolCall.status === 'error' && toolCall.error}
									<div
										class="mb-2 rounded border border-red-500 bg-red-50 px-3 py-2 wrap-break-word text-red-700"
									>
										Error: {toolCall.error}
									</div>
								{/if}
							{/each}
						{/if}

						{#if msg.content}
							<div class="leading-relaxed wrap-break-word whitespace-pre-wrap text-gray-800">
								{msg.content}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		{/each}

		{#if isLoading && currentToolCalls.length > 0}
			{#each currentToolCalls as toolCall (toolCall.toolCallId)}
				{#if (toolCall.status === 'streaming' || toolCall.status === 'completed') && toolCall.result}
					{#if isV0MessageBinaryFormat(toolCall.result)}
						<div class="flex max-w-full items-start gap-3">
							<div
								class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500 text-sm font-semibold text-white"
							>
								AI
							</div>
							<div
								class="min-w-0 flex-1 rounded-lg border border-orange-500 bg-amber-50 p-4 wrap-break-word"
							>
								<MessageRenderer messageBinaryFormat={toolCall.result} />
							</div>
						</div>
					{/if}
				{/if}

				{#if toolCall.status === 'error' && toolCall.error}
					<div class="flex max-w-full items-start gap-3">
						<div
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500 text-sm font-semibold text-white"
						>
							AI
						</div>
						<div class="min-w-0 flex-1 rounded-lg bg-white p-4 wrap-break-word shadow-sm">
							<div
								class="mb-2 rounded border border-red-500 bg-red-50 px-3 py-2 wrap-break-word text-red-700"
							>
								Error: {toolCall.error}
							</div>
						</div>
					</div>
				{/if}
			{/each}
		{:else if isLoading}
			<div class="p-4 text-center text-gray-600 italic">Loading...</div>
		{/if}
	</div>

	<form
		onsubmit={(e) => {
			e.preventDefault();
			handleSubmit();
		}}
	>
		<div class="flex gap-2">
			<input
				type="text"
				bind:value={message}
				placeholder="Type your message (e.g., 'Create a new v0 chat about react components')..."
				disabled={isLoading}
				class="flex-1 rounded-lg border-2 border-gray-300 px-4 py-3 text-base transition-colors duration-200 focus:border-green-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100"
			/>
			<button
				type="submit"
				disabled={isLoading || !message.trim()}
				class="cursor-pointer rounded-lg border-none bg-green-500 px-8 py-3 text-base font-semibold text-white transition-colors duration-200 hover:enabled:bg-green-600 disabled:cursor-not-allowed disabled:bg-gray-300"
			>
				Send
			</button>
		</div>
	</form>
</div>
