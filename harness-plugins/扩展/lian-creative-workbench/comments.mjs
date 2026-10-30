export function inspectComment({text,anchor='',evidenceKind='unknown',replyTo=''}={}){
 if(typeof text!=='string'||!text.trim())throw new Error('请提供评论草稿');
 const flags=[];
 for(const [name,pattern,advice] of [
  ['提纲腔',/(?:最有用的[两三]点|一是.{0,50}二是|首先.{0,50}其次)/gu,'如果正在聊天，选一个真正在意的点展开；教程答疑确实需要步骤时可以保留。'],
  ['结尾升华',/(?:这才是.{0,30}(?:意义|真话|生活)|不是.{0,35}而是|大概是同一件事|真正的.{0,25}在于|是替它争.{0,20})/gu,'确认这是你确实想表达的观点，还是顺手加上的漂亮结尾。'],
  ['无依据比较',/(?:比.{0,25}(?:更动人|还动人|实在|好太多)|大多数.{0,20}都)/gu,'先说这条作品具体哪里打动你，少替其他作品和观众下结论。'],
  ['过度联想',/(?:我昨天刚读到|这让我想起|由此联想到)/gu,'联想可以保留，但看看是否挤掉了对当前视频和对方的回应。'],
  ['评审口吻',/(?:这两句摆在一起才是|这是手艺人的做法|作者真正想表达|值得每个人深思)/gu,'试着以参与者口吻说具体感受，而不是替创作者盖章。']
 ]){const matches=[...text.matchAll(pattern)].map(m=>m[0]);if(matches.length)flags.push({name,matches,advice});}
 if(text.length>100)flags.push({name:'信息负担',characters:text.length,advice:'检查是否有两个以上话题；有必要时可以长评，字数本身不是问题。'});
 if(!anchor.trim())flags.push({name:'缺上下文锚点',advice:'先补一条真正读到的字幕、画面、具体说法或被回复的留言，再判断这条评论适不适合这里。'});
 if(!['frame','video','audio','transcript'].includes(evidenceKind)&&/(?:他一边|她一边|镜头里|画面里|手里还捏)/u.test(text))flags.push({name:'画面证据待核实',advice:'当前证据类型不足以确认画面；回看真实视频/帧，或明确这只是转述评论。'});
 return {characters:text.length,anchor,replyTo,evidenceKind,flags,notice:'这是可复核的措辞提示，不判定作者是不是AI，不证明自然度，不拦截发送，也不修改评论权限或频率。'};
}
