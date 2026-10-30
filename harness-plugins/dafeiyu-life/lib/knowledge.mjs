// Local lexical retrieval: no embedding provider, extra bill, or uploaded archive.
export function queryTerms(query){
  const q=String(query??'').normalize('NFKC').toLowerCase().trim().slice(0,200),terms=[];
  for(const word of q.match(/[a-z0-9]+/g)??[])if(word.length>1)terms.push(word);
  for(const run of q.match(/[\p{Script=Han}]+/gu)??[]){
    if(run.length===1)terms.push(run);
    else for(let i=0;i<run.length-1;i++)terms.push(run.slice(i,i+2));
  }
  return [...new Set(terms)];
}
export function rankKnowledge(rows,query,{limit=10,includePrivate=false}={}){
  const terms=queryTerms(query),q=String(query??'').normalize('NFKC').toLowerCase().trim();
  const n=Math.max(1,Math.min(Number.isFinite(limit)?Math.floor(limit):10,30));
  return rows.filter(r=>includePrivate||r.visibility==='public').map(row=>{
    const title=row.title.toLowerCase(),summary=row.summary.toLowerCase();
    const matched=terms.filter(t=>title.includes(t)||summary.includes(t));
    const score=(q&&title.includes(q)?12:0)+(q&&summary.includes(q)?5:0)+matched.reduce((s,t)=>s+(title.includes(t)?4:1),0);
    return {row,score,matched};
  }).filter(x=>!q||x.score>0).sort((a,b)=>b.score-a.score||b.row.observedAt.localeCompare(a.row.observedAt))
    .slice(0,n).map(({row,score,matched})=>({...row,relevance:score,matchedTerms:matched}));
}
