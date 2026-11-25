import type {ReportSheet,ReportSnapshot} from './report';
import {reportCsvRows} from './report';
import {toCSV} from './csv';
import {t} from './content';

export function downloadBytes(data:BlobPart,name:string,mime:string){
 const blob=new Blob([data],{type:mime});const url=URL.createObjectURL(blob);
 const link=document.createElement('a');link.href=url;link.download=name;link.click();
 setTimeout(()=>URL.revokeObjectURL(url),800);
}
export function safeFilename(title:string){return (title||t('report.fileName')).replace(/[^a-z0-9 -]/gi,'').trim().replace(/\s+/g,'-').slice(0,64)||t('report.fileName');}
export function downloadMarkdown(r:ReportSnapshot){downloadBytes(r.markdown,safeFilename(r.title)+'.md','text/markdown;charset=utf-8');}
export function downloadCSV(r:ReportSnapshot){downloadBytes('\uFEFF'+toCSV(reportCsvRows(r)),safeFilename(r.title)+'.csv','text/csv;charset=utf-8');}

const xml=(v:unknown):string=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,' ');
function excelCol(index:number):string{let s='';for(let n=index+1;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
export function buildWorksheet(rows:ReportSheet['rows']):string{
 const cells=rows.map((values,ri)=>`<row r="${ri+1}">${values.map((value,ci)=>{
  const cell=excelCol(ci)+(ri+1);if(value===null||value===undefined||value==='')return '';
  if(typeof value==='number'&&Number.isFinite(value))return `<c r="${cell}" s="${ri===0?1:0}"><v>${value}</v></c>`;
  let text=String(value);
  // Spreadsheet formula injection: inline strings are not formulas, but protect downstream tools.
  if(/^[\s]*[=+@]/.test(text))text="'"+text;
  return `<c r="${cell}" t="inlineStr" s="${ri===0?1:0}"><is><t xml:space="preserve">${xml(text.slice(0,32767))}</t></is></c>`;
 }).join('')}</row>`).join('');
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="1" width="26" customWidth="1"/><col min="2" max="16" width="34" customWidth="1"/></cols><sheetData>${cells}</sheetData></worksheet>`;
}
// OpenXML workbook written as a standards-compliant uncompressed ZIP. No CDN or export library needed.
const encoder=new TextEncoder();
const write16=(arr:number[],n:number)=>{arr.push(n&255,(n>>8)&255);};
const write32=(arr:number[],n:number)=>{arr.push(n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255);};
const crcTable=new Uint32Array(256);
for(let i=0;i<256;i++){let c=i;for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);crcTable[i]=c>>>0;}
function crc32(bytes:Uint8Array){let c=0xFFFFFFFF;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
export function zipStored(files:Record<string,string>):Uint8Array<ArrayBuffer>{
 const local:number[]=[];const central:number[]=[];let count=0;
 for(const [path,content] of Object.entries(files)){
  const name=encoder.encode(path),body=encoder.encode(content),crc=crc32(body),offset=local.length;
  write32(local,0x04034b50);write16(local,20);write16(local,0);write16(local,0);write16(local,0);write16(local,0);
  write32(local,crc);write32(local,body.length);write32(local,body.length);write16(local,name.length);write16(local,0);
  for(const b of name)local.push(b);for(const b of body)local.push(b);
  write32(central,0x02014b50);write16(central,20);write16(central,20);write16(central,0);write16(central,0);write16(central,0);write16(central,0);
  write32(central,crc);write32(central,body.length);write32(central,body.length);write16(central,name.length);write16(central,0);write16(central,0);write16(central,0);
  write16(central,0);write32(central,0);write32(central,offset);central.push(...name);count++;
 }
 const end:number[]=[];write32(end,0x06054b50);write16(end,0);write16(end,0);write16(end,count);write16(end,count);write32(end,central.length);write32(end,local.length);write16(end,0);
 return Uint8Array.from([...local,...central,...end]);
}
export function createXlsx(report:ReportSnapshot):Uint8Array<ArrayBuffer> {
 const sheets=report.sheets.map((s,i)=>({...s,name:s.name.replace(/[\\/\[\]:*?]/g,'').slice(0,31)||`Sheet${i+1}`}));
 const wbSheets=sheets.map((s,i)=>`<sheet name="${xml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('');
 const rels=sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')+`<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
 const contentTypes=sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
 const files:Record<string,string>={
  '[Content_Types].xml':`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${contentTypes}</Types>`,
  '_rels/.rels':`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  'xl/workbook.xml':`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${wbSheets}</sheets></workbook>`,
  'xl/_rels/workbook.xml.rels':`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`,
  'xl/styles.xml':`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF172033"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`
 };
 sheets.forEach((s,i)=>{files[`xl/worksheets/sheet${i+1}.xml`]=buildWorksheet(s.rows);});
 return zipStored(files);
}
export function downloadXlsx(r:ReportSnapshot){downloadBytes(createXlsx(r),safeFilename(r.title)+'.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');}

// Portable PDF writer for direct browser downloads; fonts are standard PDF Helvetica fonts.
// Includes automatic multi-page line wrapping, page numbers and visible classification labels.
function pdfText(s:string){return s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[\u2013\u2014]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[\u2022]/g,'-').replace(/[^\x20-\x7E]/g,'?').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');}
function wrap(line:string,limit=101):string[]{
 const clean=line.replace(/\s+/g,' ').trim();if(!clean)return [''];
 const words=clean.split(' ');const out:string[]=[];let current='';
 for(let word of words){while(word.length>limit){if(current){out.push(current);current='';}out.push(word.slice(0,limit));word=word.slice(limit);}
  if((current+' '+word).trim().length>limit){out.push(current);current=word;}else current=(current+' '+word).trim();}
 if(current)out.push(current);return out;
}
export function createPdf(report:ReportSnapshot):Uint8Array<ArrayBuffer> {
 const pageOps:string[][]=[];let lines:string[]=[];let y=767;const addPage=()=>{pageOps.push(lines);lines=[];y=767;};
 const add=(text:string,bold=false)=>{const size=bold?12:9.2;const height=bold?21:13.6;
  for(const fragment of wrap(text,bold?81:108)){if(y<66)addPage();lines.push(`BT /${bold?'F2':'F1'} ${size} Tf 0.15 0.22 0.23 rg 44 ${y.toFixed(2)} Td (${pdfText(fragment)}) Tj ET`);y-=height;}
 };
 for(const s of report.sections){if(y<150)addPage();y-=7;add(s.heading,true);for(const line of s.lines)add('- '+line);y-=12;}
 if(lines.length||!pageOps.length)addPage();
 const objs:string[]=[];const reserve=()=>{objs.push('');return objs.length;};
 const root=reserve(),pages=reserve(),fontNormal=reserve(),fontBold=reserve();
 objs[fontNormal-1]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
 objs[fontBold-1]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
 const pageIds:number[]=[];
 for(let i=0;i<pageOps.length;i++){
  const page=reserve(),content=reserve();pageIds.push(page);
  const head=`0.09 0.13 0.2 rg 0 801 595 41 re f\nBT /F2 14 Tf 1 1 1 rg 44 816 Td (${pdfText(t('report.pdfHeader'))}) Tj ET\n`;
  const footerText=t('app.footer').split('©').map(pdfText).join('\\251');
  const footer=`0.54 0.61 0.62 rg 44 40 507 0.5 re f\nBT /F1 8 Tf 0.38 0.43 0.44 rg 44 27 Td (${footerText}) Tj ET\nBT /F1 8 Tf 0.38 0.43 0.44 rg 500 27 Td (${i+1} / ${pageOps.length}) Tj ET\n`;
  const payload=head+pageOps[i].join('\n')+'\n'+footer;
  objs[content-1]=`<< /Length ${encoder.encode(payload).length} >>\nstream\n${payload}\nendstream`;
  objs[page-1]=`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontNormal} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${content} 0 R >>`;
 }
 objs[pages-1]=`<< /Type /Pages /Kids [${pageIds.map(x=>x+' 0 R').join(' ')}] /Count ${pageIds.length} >>`;
 objs[root-1]=`<< /Type /Catalog /Pages ${pages} 0 R >>`;
 let output='%PDF-1.4\n';const offsets:number[]=[0];
 for(let i=0;i<objs.length;i++){offsets.push(encoder.encode(output).length);output+=`${i+1} 0 obj\n${objs[i]}\nendobj\n`;}
 const xref=encoder.encode(output).length;output+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;
 for(let i=1;i<offsets.length;i++)output+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
 output+=`trailer\n<< /Size ${objs.length+1} /Root ${root} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return encoder.encode(output);
}
export function downloadPdf(r:ReportSnapshot){downloadBytes(createPdf(r),safeFilename(r.title)+'.pdf','application/pdf');}
export async function downloadSvgAsPng(svg:SVGSVGElement,name:string){
 const clone=svg.cloneNode(true) as SVGSVGElement;
 clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
 const rect=svg.getBoundingClientRect(),w=Math.max(1,Math.ceil(rect.width)),h=Math.max(1,Math.ceil(rect.height));
 clone.setAttribute('width',String(w));clone.setAttribute('height',String(h));
 const xmlText=new XMLSerializer().serializeToString(clone);
 const url=URL.createObjectURL(new Blob([xmlText],{type:'image/svg+xml;charset=utf-8'}));
 try {const image=new Image();image.src=url;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=w*2;canvas.height=h*2;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas 2D unavailable');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.scale(2,2);ctx.drawImage(image,0,0,w,h);
  const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG encoding failed')),'image/png'));
  downloadBytes(png,name.replace(/\W+/g,'-')+'.png','image/png');
 } finally {URL.revokeObjectURL(url);}
}
