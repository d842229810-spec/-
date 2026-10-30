import sys,json
from scenedetect import open_video,SceneManager,ContentDetector,AdaptiveDetector,FrameTimecode
args=json.loads(sys.stdin.buffer.read().decode('utf-8'));video=open_video(args['file']);fps=float(video.frame_rate);duration=float(video.duration.get_seconds())
start=float(args.get('start',0));end=min(float(args.get('end',start+60)),duration)
if start<0 or start>=duration or end<=start or end-start>300:raise ValueError('请选择文件内最多300秒的片段')
video.seek(FrameTimecode(start,fps));manager=SceneManager();manager.add_detector(AdaptiveDetector() if args.get('detector','adaptive')=='adaptive' else ContentDetector(threshold=27))
manager.detect_scenes(video=video,end_time=FrameTimecode(end,fps),show_progress=False)
rows=manager.get_scene_list(start_in_scene=True);cuts=sorted(set([start,end]+[max(start,min(end,s.get_seconds())) for a,b in rows for s in (a,b)]))
scenes=[{'start':round(a,4),'end':round(b,4),'duration':round(b-a,4),'representativeTime':round((a+b)/2,4)} for a,b in zip(cuts,cuts[1:]) if b-a>.001]
print(json.dumps({'engine':'PySceneDetect 0.7.2','detector':args.get('detector','adaptive'),'durationSeconds':duration,'fps':fps,'range':{'start':start,'end':end,'complete':start==0 and end>=duration-.05,'nextStart':end if end<duration-.05 else None},'shots':scenes,'notice':'镜头切点是算法候选，闪光、运动或渐变可能误判/漏判；不是剧情分场或审美评分。'},ensure_ascii=False))
