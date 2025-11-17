import type { MessageElement } from './types';
import type { MessageBinaryFormat } from './v0-stream-parser';

export type { MessageElement };

export const parseMessage = (content: MessageBinaryFormat, messageId = 'message') => {
	if (!Array.isArray(content)) {
		console.warn('Content must be an array (MessageBinaryFormat)');
		return { elements: [] };
	}

	const elements = content
		.map(([type, data], index) => {
			const key = `${messageId}-${index}`;

			if (type === 0) {
				return processElements(data, key);
			}

			if (type === 1) {
				return null;
			}

			return null;
		})
		.filter((el): el is MessageElement => el !== null);

	return { elements };
};

const processElements = (data: unknown, keyPrefix: string): MessageElement | null => {
	if (!Array.isArray(data)) {
		return null;
	}

	const contentPartIndices: number[] = [];
	data.forEach((item, index) => {
		if (Array.isArray(item) && item[0] === 'AssistantMessageContentPart') {
			contentPartIndices.push(index);
		}
	});

	const children = data
		.map((item, index) => {
			const key = `${keyPrefix}-${index}`;
			const partIndex = contentPartIndices.indexOf(index);
			const isLastContentPart = partIndex !== -1 && partIndex === contentPartIndices.length - 1;

			return processElement(item, key, isLastContentPart);
		})
		.filter((el): el is MessageElement => el !== null);

	return {
		type: 'component' as const,
		key: keyPrefix,
		data: 'elements',
		children: children.length > 0 ? children : undefined
	};
};

const processElement = (
	element: unknown,
	key: string,
	isLastContentPart: boolean
): MessageElement | null => {
	if (typeof element === 'string') {
		return {
			type: 'text' as const,
			key,
			data: element
		};
	}

	if (!Array.isArray(element)) {
		return null;
	}

	const [tagName, props, ...children] = element;

	if (!tagName) {
		return null;
	}

	if (tagName === 'AssistantMessageContentPart') {
		return {
			type: 'content-part' as const,
			key,
			data: {
				part: props.part,
				isLastContentPart
			}
		};
	}

	if (tagName === 'Codeblock') {
		return {
			type: 'code-block' as const,
			key,
			data: {
				language: props.lang,
				code: children[0] || ''
			}
		};
	}

	if (tagName === 'text') {
		return {
			type: 'text' as const,
			key,
			data: children[0] || ''
		};
	}

	const processedChildren = children
		.map((child, childIndex) => {
			const childKey = `${key}-child-${childIndex}`;
			return processElement(child, childKey, isLastContentPart);
		})
		.filter((el): el is MessageElement => el !== null);

	return {
		type: 'html' as const,
		key,
		data: {
			tagName,
			props
		},
		children: processedChildren.length > 0 ? processedChildren : undefined
	};
};
