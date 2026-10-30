import {defineConfig} from 'vite';import motionCanvasModule from '@motion-canvas/vite-plugin';import ffmpegModule from '@motion-canvas/ffmpeg';
import {fileURLToPath} from 'node:url';import ffmpeg from 'fluent-ffmpeg';
const motionCanvas=motionCanvasModule.default??motionCanvasModule,videoExporter=ffmpegModule.default??ffmpegModule;
const binaries='C:/Users/USER/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.2-full_build/bin';
ffmpeg.setFfmpegPath(binaries+'/ffmpeg.exe');ffmpeg.setFfprobePath(binaries+'/ffprobe.exe');
export default defineConfig({plugins:[motionCanvas({project:'./src/project.ts',output:'./out'}),videoExporter()],server:{host:'127.0.0.1',port:8431,strictPort:true,fs:{allow:[fileURLToPath(new URL('.',import.meta.url)),'E:/DSH/插件/motion-canvas-runtime']}},resolve:{preserveSymlinks:false}});
