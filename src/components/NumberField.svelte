<script lang="ts">
 export let label: string;
 export let value: number | null;
 export let hint = '';
 export let min = 0;
 export let max: number | undefined = undefined;
 export let onChange: (value: number | null) => void;
 function handle(event: Event) {
  const text = (event.target as HTMLInputElement).value;
  if (text === '') return onChange(null);
  const n = Number(text);
  if (!Number.isFinite(n)) return;
  onChange(Math.min(max ?? Infinity, Math.max(min, n)));
 }
</script>
<label class="field"><span>{label}</span><input type="number" {min} {max} step="any" value={value ?? ''} on:input={handle}/>{#if hint}<small>{hint}</small>{/if}</label>
