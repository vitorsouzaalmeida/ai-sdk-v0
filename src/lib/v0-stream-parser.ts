import * as jdf from 'jsondiffpatch';
import type { V0Delta, V0StringAppendDelta } from './types';

export type MessageBinaryFormat = [number, ...unknown[]][];

type StreamEvent = {
	type: 'connected' | 'delta' | 'done' | 'chat-data';
	delta?: V0Delta;
	data?: unknown;
	object?: string;
	id?: string;
};

type StreamState = {
	buffer: string;
	content: MessageBinaryFormat;
	chatId: string | null;
};

const parseSSELine = (line: string) => (line.startsWith('data: ') ? line.slice(6) : line);

const extractChatId = (event: StreamEvent, currentChatId: string | null) =>
	event.object === 'chat' && event.id ? event.id : currentChatId;

const shouldYield = (event: StreamEvent) => Boolean(event.delta);

const isComplete = (data: string, event: StreamEvent) => data === '[DONE]' || event.type === 'done';

export async function* parseV0Stream(stream: ReadableStream<Uint8Array>) {
	const reader = stream.getReader();
	const decoder = new TextDecoder();

	const processChunk = (state: StreamState, value: Uint8Array): StreamState => {
		const newBuffer = state.buffer + decoder.decode(value, { stream: true });
		const lines = newBuffer.split('\n');
		const remainingBuffer = lines.pop() || '';

		const { content, chatId } = lines
			.filter((line) => line.trim())
			.reduce(
				(acc, line) => {
					const data = parseSSELine(line);

					try {
						const event = JSON.parse(data);

						if (isComplete(data, event)) {
							return acc;
						}

						const updatedChatId = extractChatId(event, acc.chatId);

						if (event.type === 'connected' || (event.object && event.object.startsWith('chat'))) {
							return { ...acc, chatId: updatedChatId };
						}

						if (shouldYield(event)) {
							return {
								content: applyDelta(acc.content, event.delta),
								chatId: updatedChatId
							};
						}

						return { ...acc, chatId: updatedChatId };
					} catch (e) {
						console.error('Error parsing SSE event:', e, data);
						return acc;
					}
				},
				{ content: state.content, chatId: state.chatId }
			);

		return { buffer: remainingBuffer, content, chatId };
	};

	try {
		let state: StreamState = { buffer: '', content: [], chatId: null };

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			const previousContent = state.content;
			state = processChunk(state, value);

			if (state.content !== previousContent) {
				yield { content: state.content, chatId: state.chatId };
			}
		}

		return { content: state.content, chatId: state.chatId };
	} finally {
		reader.releaseLock();
	}
}

const isV0StringAppendDelta = (delta: unknown): delta is V0StringAppendDelta =>
	Array.isArray(delta) && delta.length === 3 && delta[1] === 9 && delta[2] === 9;

const applyStringAppend = (
	obj: unknown,
	indexes: number[],
	value: string,
	currentIndex: number = 0
): unknown => {
	if (!obj || (typeof obj !== 'object' && !Array.isArray(obj))) {
		return obj;
	}

	const indexable = obj as Record<number, unknown>;

	if (currentIndex === indexes.length - 1) {
		const targetIndex = indexes[currentIndex];
		if (typeof indexable[targetIndex] === 'string') {
			const cloned = Array.isArray(obj) ? obj.slice() : { ...(obj as Record<string, unknown>) };
			(cloned as Record<number, unknown>)[targetIndex] = (indexable[targetIndex] as string) + value;
			return cloned;
		}
		return obj;
	}

	const currentIdx = indexes[currentIndex];
	const nextObj = indexable[currentIdx] ?? [];
	const updated = applyStringAppend(nextObj, indexes, value, currentIndex + 1);

	if (Array.isArray(obj)) {
		const cloned = obj.slice();
		cloned[currentIdx] = updated;
		return cloned;
	} else {
		return { ...(obj as Record<string, unknown>), [currentIdx]: updated };
	}
};

const applyV0StringAppendDelta = (original: MessageBinaryFormat, delta: V0StringAppendDelta) => {
	const [pathAndValue] = delta;

	if (!Array.isArray(pathAndValue) || pathAndValue.length === 0) return original;

	const allButLast = pathAndValue.slice(0, -1);
	const lastElement = pathAndValue[pathAndValue.length - 1];

	const indexes = allButLast as number[];
	const value = lastElement as string;

	return applyStringAppend(original, indexes, value) as MessageBinaryFormat;
};

const applyJsonDiffPatch = (obj: MessageBinaryFormat, delta: object) => {
	try {
		const cloned = jdf.clone(obj) as MessageBinaryFormat;
		jdf.patch(cloned, delta as jdf.Delta);
		return cloned;
	} catch (e) {
		console.error('Error applying jsondiffpatch:', e);
		return obj;
	}
};

const applyDelta = (original: MessageBinaryFormat, delta: V0Delta) => {
	if (isV0StringAppendDelta(delta)) return applyV0StringAppendDelta(original, delta);

	return applyJsonDiffPatch(original, delta as object);
};
