export const packageName='@local/lian-workspace-manager';
const codec=(name,parse)=>{const schema={parse};return {mode:'strict',typeSymbol:packageName+'#'+name,schema,create:()=>schema};};
const json=codec('JSON',v=>{if(typeof v!=='string'||v.length>1000000)throw Error('Expected bounded JSON text');JSON.parse(v);return v;});
export const descriptors=['getPartitions','setPartition'].map(method=>({id:packageName+'#lianWorkspace/'+method,service:'lianWorkspace',namespace:'lianWorkspace',method,invocation:{kind:'direct'},parameters:method==='getPartitions'?[]:[{name:'input',wire:'input',source:'json',codec:json}],result:json}));
export const TYPERT={package:packageName,face:'host',schemas:[],invocations:descriptors,api:{services:[],events:[],objects:[]}};
export default TYPERT;
