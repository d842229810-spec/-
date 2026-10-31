import fs from 'node:fs';import path from 'node:path';
import {TYPERT} from './workspace-contract.mjs';import {createPartitionStore} from './partition-store.mjs';
export const name='lian-workspace-menu';export const inject=['workspaceRegistry','sessionPersistence','typert'];
export function apply(ctx,config={}){
 const store=createPartitionStore({root:config.stateDir,registry:ctx.workspaceRegistry,persistence:ctx.sessionPersistence});
 const service={getPartitions:()=>JSON.stringify(store.read()),setPartition:async input=>JSON.stringify(await store.update(JSON.parse(input)))};
 Object.defineProperty(service,'typertRemote',{value:{service,serviceKey:'lianWorkspaceMenu',namespace:'lianWorkspaceMenu'}});
 ctx.provide('lianWorkspaceMenu',service);ctx.effect(()=>ctx.typert.register(TYPERT));
 const at=new Date().toISOString();fs.writeFileSync(path.join(store.root,'menu-health.json'),JSON.stringify({ready:true,version:'1.2.0',registeredAt:at,observedAt:at,modelCalls:0,verification:{kind:'registration',fullUiVerified:false},partitionRevision:store.read().revision}));
}
