import type {Row} from './types';
/** RFC-4180-compatible reader for quoted delimiters, CRLF, embedded newlines and double quotes. */
export function parseCSV(input: string): Row[] {
  const text = input.replace(/^\uFEFF/, '');
  const records: string[][] = []; let record: string[] = []; let value = ''; let quoted = false;
  for (let i=0; i<text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i+1] === '"') {value+='"';i++;}
      else if (c === '"') quoted=false;
      else value+=c;
    } else if (c === '"') quoted=true;
    else if (c === ',') {record.push(value); value='';}
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i+1] === '\n') i++;
      record.push(value); value='';
      if (record.some(cell=>cell.length>0)) records.push(record);
      record=[];
    } else value+=c;
  }
  if (quoted) throw new Error('CSV has an unterminated quoted value');
  if (value.length || record.length) {record.push(value); if (record.some(x=>x.length)) records.push(record);}
  if (!records.length) return [];
  const [headers,...data] = records;
  return data.map(cells=>Object.fromEntries(headers.map((name,i)=>[name.trim(),cells[i]??''])));
}
export function csvCell(value:unknown):string {
  let result = value===null||value===undefined?'':String(value);
  // Defend against CSV / spreadsheet formula injection in free-text fields.
  if (/^[\s\r\n]*[=+@]/.test(result) || (/^[\s\r\n]*-/.test(result)&&!/^\s*-\d+(\.\d+)?\s*$/.test(result))) result="'"+result;
  return /[",\r\n]/.test(result)?'"'+result.replace(/"/g,'""')+'"':result;
}
export function toCSV(rows:Row[],headers?:string[]):string {
  const fields=headers||Array.from(new Set(rows.flatMap(r=>Object.keys(r))));
  return [fields.map(csvCell).join(','),...rows.map(r=>fields.map(f=>csvCell(r[f])).join(','))].join('\r\n')+'\r\n';
}
export function num(value:unknown, fallback=0):number {
  if(value===''||value===null||value===undefined)return fallback;
  const n=Number(value);return Number.isFinite(n)?n:fallback;
}
export function truthy(value:unknown):boolean {return value===true||String(value).toLowerCase()==='true'||String(value)==='1';}
export function formatCompact(value:number, unit=''):string {
  if(!Number.isFinite(value)) return '—';
  if(Math.abs(value)>=1e12)return unit+(value/1e12).toFixed(2)+'T';
  if(Math.abs(value)>=1e9)return unit+(value/1e9).toFixed(2)+'B';
  if(Math.abs(value)>=1e6)return unit+(value/1e6).toFixed(2)+'M';
  if(Math.abs(value)>=1e3)return unit+Math.round(value).toLocaleString('en-US');
  return unit+value.toFixed(Math.abs(value)<10?2:0);
}
