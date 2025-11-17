<script lang="ts">
	import { parseMessage, type MessageElement } from './message-parser';
	import type { MessageBinaryFormat } from './v0-stream-parser';
	import type { TaskThinkingPart, ThinkingEndPart, ContentPart } from './types';

	type Props = { messageBinaryFormat: MessageBinaryFormat };

	let { messageBinaryFormat }: Props = $props();

	const messageData = $derived.by(() => {
		try {
			return parseMessage(messageBinaryFormat);
		} catch (error) {
			console.error('Error parsing MessageBinaryFormat:', error);
			return { elements: [] };
		}
	});

	const isThinking = (part: ContentPart): part is TaskThinkingPart =>
		part?.type === 'task-thinking-v1';

	const getThinkingTitle = (part: TaskThinkingPart) => {
		const hasEnded = part?.parts?.some((p) => p.type === 'thinking-end');
		return hasEnded ? 'Thought' : 'Thinking...';
	};

	const getThinkingContent = (part: TaskThinkingPart) => {
		const thinkingEndPart = part?.parts?.find(
			(p): p is ThinkingEndPart => p.type === 'thinking-end'
		);
		return thinkingEndPart?.thought || '';
	};
</script>

<div class="flex flex-col gap-4 leading-relaxed">
	{#if messageData.elements.length === 0}
		<div class="rounded border border-amber-400 bg-amber-50 p-4 text-sm">
			<p><strong>No elements parsed</strong></p>
			<details class="mt-2">
				<summary class="cursor-pointer font-medium text-amber-800"
					>Raw MessageBinaryFormat (click to expand)</summary
				>
				<pre
					class="mt-2 max-h-96 overflow-x-auto overflow-y-auto rounded bg-white p-3 text-xs">{JSON.stringify(
						messageBinaryFormat,
						null,
						2
					)}</pre>
			</details>
		</div>
	{:else}
		{#each messageData.elements as element (element.key)}
			{@render renderElement(element)}
		{/each}
	{/if}
</div>

{#snippet renderElement(element: MessageElement)}
	{#if element.type === 'text'}
		<span>{element.data}</span>
	{:else if element.type === 'content-part'}
		{#if isThinking(element.data.part)}
			<div class="my-2 max-w-full rounded-lg border border-blue-300 bg-blue-50 p-4 wrap-break-word">
				<div class="mb-3 flex items-center gap-2 font-semibold text-blue-700">
					<span class="text-sm tracking-wide uppercase">{getThinkingTitle(element.data.part)}</span>
				</div>
				{#if getThinkingContent(element.data.part)}
					<div
						class="max-w-full rounded bg-white p-3 text-sm wrap-break-word whitespace-pre-wrap text-gray-800"
					>
						{getThinkingContent(element.data.part)}
					</div>
				{/if}
			</div>
		{:else}
			<div class="my-2 rounded-lg border border-gray-300 bg-gray-100 p-4">
				<strong class="mb-2 block text-sm text-gray-600 uppercase"
					>{element.data.part?.type || 'Unknown part'}</strong
				>
				<pre class="m-0 overflow-x-auto rounded bg-white p-3 text-sm">{JSON.stringify(
						element.data.part,
						null,
						2
					)}</pre>
			</div>
		{/if}
	{:else if element.type === 'code-block'}
		<div class="my-2 overflow-hidden rounded-lg bg-gray-900">
			<div class="border-b border-gray-700 bg-gray-800 px-4 py-2">
				<span class="font-mono text-sm text-gray-400 uppercase"
					>{element.data.language || 'code'}</span
				>
			</div>
			<pre class="m-0 overflow-x-auto p-4"><code class="font-mono text-sm leading-6 text-gray-300"
					>{element.data.code}</code
				></pre>
		</div>
	{:else if element.type === 'html'}
		{#if element.data.tagName === 'p'}
			<p class="my-2">
				{#if element.children}
					{#each element.children as child (child.key)}
						{@render renderElement(child)}
					{/each}
				{/if}
			</p>
		{:else if element.data.tagName === 'strong'}
			<strong class="font-semibold">
				{#if element.children}
					{#each element.children as child (child.key)}
						{@render renderElement(child)}
					{/each}
				{/if}
			</strong>
		{:else if element.data.tagName === 'em'}
			<em class="italic">
				{#if element.children}
					{#each element.children as child (child.key)}
						{@render renderElement(child)}
					{/each}
				{/if}
			</em>
		{:else if element.data.tagName === 'code'}
			<code class="rounded bg-gray-100 px-2 py-1 font-mono text-sm">
				{#if element.children}
					{#each element.children as child (child.key)}
						{@render renderElement(child)}
					{/each}
				{/if}
			</code>
		{:else if element.data.tagName === 'ul'}
			<ul class="my-2 pl-6">
				{#if element.children}
					{#each element.children as child (child.key)}
						{@render renderElement(child)}
					{/each}
				{/if}
			</ul>
		{:else if element.data.tagName === 'ol'}
			<ol class="my-2 pl-6">
				{#if element.children}
					{#each element.children as child (child.key)}
						{@render renderElement(child)}
					{/each}
				{/if}
			</ol>
		{:else if element.data.tagName === 'li'}
			<li class="my-1">
				{#if element.children}
					{#each element.children as child (child.key)}
						{@render renderElement(child)}
					{/each}
				{/if}
			</li>
		{:else}
			<!-- Generic HTML element -->
			<div>
				{#if element.children}
					{#each element.children as child (child.key)}
						{@render renderElement(child)}
					{/each}
				{/if}
			</div>
		{/if}
	{:else if element.type === 'component'}
		<!-- Component wrapper - just render children -->
		{#if element.children}
			{#each element.children as child (child.key)}
				{@render renderElement(child)}
			{/each}
		{/if}
	{/if}
{/snippet}
