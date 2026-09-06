// CSV state machine: quoted commas, escaped quotes and embedded CR/LF survive round trips.
export function parseCsv(input) {
  const text=String(input??'').replace(/^\uFEFF/,'');
  const rows=[];let row=[],cell='',quoted=false,afterQuote=false;
  const finishRow=()=>{row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';afterQuote=false;};
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted){
      if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}
      else if(c==='"'){quoted=false;afterQuote=true;}else cell+=c;
    }else if(c==='"'){
      if(cell.trim()||afterQuote)throw new Error('Malformed CSV quoting.');
      cell='';quoted=true;
    }else if(c===','){row.push(cell);cell='';afterQuote=false;}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;finishRow();}
    else {if(afterQuote&&!/\s/.test(c))throw new Error('Unexpected text after a quoted CSV cell.');if(!afterQuote)cell+=c;}
  }
  if(quoted)throw new Error('CSV has an unterminated quoted field.');
  if(cell||row.length)finishRow();
  return rows;
}
export function csvCell(value) {
  const text=String(value??'');
  return /[",\r\n]/.test(text)||/^\s|\s$/.test(text)?`"${text.replace(/"/g,'""')}"`:text;
}
export const csvRow=values=>values.map(csvCell).join(',');
