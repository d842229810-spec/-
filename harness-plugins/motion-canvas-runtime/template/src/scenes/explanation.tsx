import {makeScene2D, Circle, Line, Txt, Rect} from '@motion-canvas/2d';
import {all,createRef,createSignal,waitFor,easeInOutCubic} from '@motion-canvas/core';
export default makeScene2D(function* (view){
 view.fill('#f4f1e9');const progress=createSignal(0),nodes=[createRef<Circle>(),createRef<Circle>(),createRef<Circle>()];
 view.add(<><Txt text="让一个问题，走到答案。" fontFamily="Microsoft YaHei" fontSize={58} fontWeight={700} fill="#173b50" y={-230}/><Txt text="涟 / 矢量图解与流程动画 · 环境验收" fontFamily="Microsoft YaHei" fontSize={24} fill="#607a87" y={-150}/><Line points={[[-370,25],[370,25]]} stroke="#a9cbd5" lineWidth={5} end={progress}/><Rect width={1120} height={1} y={260} fill="#b8ccd1"/><Txt text="原生 Motion Canvas · 可编辑的形状、信号与时间轴" fontFamily="Microsoft YaHei" fontSize={23} fill="#607a87" y={295}/>{['观察','提问','验证'].map((text,i)=><Circle ref={nodes[i]} width={165} height={165} x={-370+i*370} y={25} fill={i===1?'#1682b3':'#dbeaf0'} opacity={0} scale={0.6}><Txt text={text} fontFamily="Microsoft YaHei" fontSize={36} fill={i===1?'white':'#173b50'}/></Circle>)}</>);
 yield* all(nodes[0]().opacity(1,.5),nodes[0]().scale(1,.6,easeInOutCubic));yield* progress(.5,.7);yield* all(nodes[1]().opacity(1,.5),nodes[1]().scale(1,.6));yield* progress(1,.7);yield* all(nodes[2]().opacity(1,.5),nodes[2]().scale(1,.6));yield* waitFor(1.4);
});
