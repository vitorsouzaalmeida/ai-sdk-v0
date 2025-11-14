import { VERCEL_API_KEY } from '$env/static/private';
import { createVercel } from '@ai-sdk/vercel';
import { streamText } from 'ai';
import type { RequestHandler } from './$types';

const vercel = createVercel({
	apiKey: VERCEL_API_KEY
});

export const POST: RequestHandler = async ({ request }) => {
	const { message } = await request.json();

	const result = streamText({
		model: vercel('v0-1.5-md'),
		prompt: message
	});

	// Use fullStream to get structured events instead of just text
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			try {
				for await (const chunk of result.fullStream) {
					// Send each chunk as a JSON line
					const json = JSON.stringify(chunk) + '\n';
					controller.enqueue(encoder.encode(json));
				}
			} catch (error) {
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
