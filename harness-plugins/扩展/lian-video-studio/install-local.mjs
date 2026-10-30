import fs from 'node:fs';import path from 'node:path';
const profile='C:/Users/USER/.dsh/profiles/desktop',root='E:/DSH/插件/扩展/lian-video-studio';
const stamp=new Date().toISOString().replaceAll(':','-'),backup='E:/DSH/安装验收/20261026-视频工作台/备份';fs.mkdirSync(backup,{recursive:true});
for(const name of ['package.json','cordis.patch.yml'])fs.copyFileSync(path.join(profile,name),path.join(backup,stamp+'-'+name));
const file=path.join(profile,'package.json'),pkg=JSON.parse(fs.readFileSync(file,'utf8'));pkg.dependencies['@local/lian-video-studio']='link:'+root;if(!pkg.dsh.profile.bundles.includes('@local/lian-video-studio'))pkg.dsh.profile.bundles.push('@local/lian-video-studio');
const link=path.join(profile,'node_modules/@local/lian-video-studio');if(!fs.existsSync(link))fs.symlinkSync(root,link,'junction');
fs.writeFileSync(file,JSON.stringify(pkg,null,2)+'\n');
const config=path.join(profile,'cordis.patch.yml');let text=fs.readFileSync(config,'utf8');if(!text.includes('- id: lian-video-studio'))text+='\n- id: lian-video-studio\n  config:\n    verificationId: video-studio-20261026-v1\n    fixtureProject: E:/LianHome/工作室/Remotion影片/制作环境验收_20261026\n';fs.writeFileSync(config,text);
console.log(JSON.stringify({profile,added:'@local/lian-video-studio',backup,installation:'local dependency link and bundle registration; existing profile dependencies untouched'}));
