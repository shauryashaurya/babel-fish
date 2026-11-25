<script lang="ts">
 /** A titled, copyable code sample. The text is shown exactly as written in the content file. */
 import {t} from '../lib/content';
 export let title: string;
 export let lang = '';
 export let text: string;
 export let note = '';
 let copied = false, timer: ReturnType<typeof setTimeout>;
 async function copy() {
  try { await navigator.clipboard.writeText(text); copied = true; clearTimeout(timer); timer = setTimeout(() => copied = false, 1600); } catch { copied = false; }
 }
</script>
<figure class="code-block">
 <figcaption><span>{title}</span>{#if lang}<small>{lang}</small>{/if}<button class="btn small" type="button" on:click={copy}>{copied ? t('agentsExplained.copied') : t('agentsExplained.copy')}</button></figcaption>
 <pre><code>{text}</code></pre>
 {#if note}<p class="note">{note}</p>{/if}
</figure>
