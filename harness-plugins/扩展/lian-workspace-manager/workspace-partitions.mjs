// Presentation-only membership. Never changes session cwd, native membership or files.
export function projectPartitions(snapshot, assignments) {
 const valid=new Set(snapshot.items.map(w=>w.workspaceId));
 const active=Object.fromEntries(Object.entries(assignments).filter(([,v])=>v===null||valid.has(v)));
 if(!Object.keys(active).length)return snapshot;
 const items=snapshot.items.map(w=>({...w,sessionIds:w.sessionIds.filter(id=>!Object.hasOwn(active,id))}));
 for(const [id,target] of Object.entries(active))if(target!==null)items.find(w=>w.workspaceId===target).sessionIds.push(id);
 return {...snapshot,items};
}
