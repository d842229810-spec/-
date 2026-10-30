---
name: lian-motion-canvas
description: 制作解释性矢量图解、公式与代码动画，用Motion Canvas生成器、信号和旁白时间事件组织镜头，补充Remotion的代码视频流程。
---

原生Motion Canvas3.17.2在E:/DSH/插件/motion-canvas-runtime；工程在E:/LianHome/工作室/MotionCanvas影片。使用whale_motion_canvas的create、preview、render、frame。原生编辑器保留完整项目配置，不把它翻译成Remotion来近似实现。

它适合可解释的图形变化、流程连线、数学图解、代码逐步演示和配合旁白调整的时间事件。用makeScene2D(function* ...)、yield*、all/chain/sequence编排，用信号驱动属性。需要旁白对点时使用waitUntil的命名事件并在原生编辑器调整事件位置；缺少事件位置时先完成对应时间标记再导出，别留下永久等待。

公式可用Latex，代码可用Code，SVG与形状变换按原生文档实现。不同功能选具体组件，不预先加载所有示例。官方参考：https://motioncanvas.io/docs/quickstart/ 、https://motioncanvas.io/docs/time-events/ 、https://motioncanvas.io/docs/rendering/video/ 。

先预览和导出一个有代表性的片段，再扩成长片。render可传width、height、fps；不传时沿用项目元数据。frame返回导出视频的实际单帧图片。声音路径、视频长度、字幕与节奏须实际核对；图片序列、原生时间轴配置等仍可在编辑器中操作。

Motion Canvas负责矢量解释动画，Remotion负责全片组织/合成，Blender负责三维资产，Updream负责需要的生成片段。它们按镜头需求协作，产物以真实文件交换。沿用lian-media-library和creation-handbooks，不擅自改角色或声音。
