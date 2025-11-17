import type { MessageBinaryFormat } from './v0-stream-parser';

export type V0ToolArgs = {
	message: string;
	system?: string;
	projectId?: string;
};

export type ToolCallResult = MessageBinaryFormat | { content: MessageBinaryFormat } | unknown;

export type ThinkingEndPart = {
	type: 'thinking-end';
	thought: string;
	duration?: number;
};

export type ThinkingStartPart = {
	type: 'thinking-start';
};

export type TaskThinkingPart = {
	type: 'task-thinking-v1';
	parts?: Array<ThinkingStartPart | ThinkingEndPart | { type: string }>;
};

export type GenericContentPart = {
	type: string;
	[key: string]: unknown;
};

export type ContentPart = TaskThinkingPart | GenericContentPart;

export type V0StringAppendDelta = [[...number[], string], 9, 9];

export type V0Delta = object | V0StringAppendDelta;

export type MessageElement =
	| {
			type: 'text';
			key: string;
			data: string;
			children?: never;
	  }
	| {
			type: 'html';
			key: string;
			data: {
				tagName: string;
				props?: Record<string, unknown>;
			};
			children?: MessageElement[];
	  }
	| {
			type: 'component';
			key: string;
			data: string;
			children?: MessageElement[];
	  }
	| {
			type: 'content-part';
			key: string;
			data: {
				part: ContentPart;
				isLastContentPart: boolean;
			};
			children?: never;
	  }
	| {
			type: 'code-block';
			key: string;
			data: {
				language?: string;
				code: string;
			};
			children?: never;
	  };
