import {BilibiliAuth} from './lib/bilibili-auth.mjs';
const auth=new BilibiliAuth(),action=process.argv[2]??'status';
if(!['start','poll','status'].includes(action))throw new Error('用法：start | poll | status');
console.log(JSON.stringify(await auth[action](),null,2));
