// Pure presentation rules shared by the native manager and the browser bundle.
export function partitionFields(sessionId,workspaces,data){
 const idOf=w=>w.id??w.workspaceId,valid=new Set(workspaces.map(idOf));
 const nativeWorkspaceId=idOf(workspaces.find(w=>w.sessionIds.includes(sessionId))??{})??null;
 const target=data.assignments[sessionId],overridden=Object.hasOwn(data.assignments,sessionId)&&(target===null||valid.has(target));
 const displayWorkspaceId=overridden?target:nativeWorkspaceId;
 return {nativeWorkspaceId,displayWorkspaceId,workspaceId:displayWorkspaceId,partitionOverride:overridden,partitionRevision:data.revision};
}
export function projectPartitions(snapshot,assignments){
 const valid=new Set(snapshot.items.map(w=>w.workspaceId));
 const active=Object.fromEntries(Object.entries(assignments).filter(([,v])=>v===null||valid.has(v)));
 if(!Object.keys(active).length)return snapshot;
 const items=snapshot.items.map(w=>({...w,sessionIds:w.sessionIds.filter(id=>!Object.hasOwn(active,id))}));
 for(const [id,target]of Object.entries(active))if(target!==null)items.find(w=>w.workspaceId===target).sessionIds.push(id);
 return {...snapshot,items};
}
