import { V0_API_KEY } from '$env/static/private';
import { parseV0Stream } from '$lib/v0-stream-parser';
import { createVercel } from '@ai-sdk/vercel';
import { createChatTools } from '@v0-sdk/ai-tools';
import { streamText, tool } from 'ai';
import { createClient } from 'v0-sdk';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const vercel = createVercel({ apiKey: V0_API_KEY });

const v0Client = createClient({ apiKey: V0_API_KEY });

const chatTools = createChatTools({ apiKey: V0_API_KEY });

const streamingCreateChat = tool({
	description: 'Create a new v0 chat and stream the response in real-time',
	inputSchema: z.object({
		message: z.string().describe('The message/prompt to send to v0'),
		system: z.string().optional().describe('System context for the chat'),
		projectId: z.string().optional().describe('Project ID to associate with the chat')
	}),
	async *execute({ message, system, projectId }) {
		try {
			yield {
				status: 'connecting' as const,
				chatId: null,
				message: 'Connecting to v0...',
				content: null
			};

			const response = await v0Client.chats.create({
				message,
				system,
				projectId,
				responseMode: 'experimental_stream'
			});

			let lastChatId: string | null = null;

			for await (const { content, chatId } of parseV0Stream(
				response as ReadableStream<Uint8Array>
			)) {
				lastChatId = chatId;
				yield {
					status: 'streaming' as const,
					chatId,
					message: 'Streaming response...',
					content
				};
			}

			yield {
				status: 'complete' as const,
				chatId: lastChatId,
				message: 'Response complete',
				content: null
			};
		} catch (error) {
			console.error('Error in streaming createChat:', error);
			yield {
				status: 'error' as const,
				chatId: null,
				message: error instanceof Error ? error.message : 'Unknown error',
				content: null
			};
		}
	}
});

export const POST: RequestHandler = async ({ request }) => {
	const { message } = await request.json();

	const result = streamText({
		model: vercel('v0-1.5-md'),
		prompt: message,
		tools: {
			createChat: streamingCreateChat,
			getChat: chatTools.getChat
		}
	});

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			try {
				for await (const chunk of result.fullStream) {
					const json = JSON.stringify(chunk) + '\n';
					controller.enqueue(encoder.encode(json));
				}
			} catch (error) {
				console.error('Server stream error:', error);
				controller.error(error);
			} finally {
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'application/x-ndjson',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
