import json, sys, uuid, math, hashlib
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps
ROOT=Path(__file__).resolve().parent
catalog=json.loads((ROOT/'public-stickers/catalog.json').read_text(encoding='utf-8'))
args=json.load(sys.stdin)
asset=next(x for x in catalog['assets'] if x['id']==args['asset'])
source=(ROOT/'public-stickers'/asset['file']).resolve()
assert source.is_relative_to((ROOT/'public-stickers').resolve())
assert hashlib.sha256(source.read_bytes()).hexdigest()==asset['sha256']
text=str(args['text']).strip()
assert 0<len(text)<=80
out=Path('E:/LianHome/工作室/表情包/小涟原创')
out.mkdir(parents=True,exist_ok=True)
picture=Image.open(source).convert('RGBA')
picture=ImageOps.contain(picture,(488,390))
font_path='C:/Windows/Fonts/msyhbd.ttc'
font=ImageFont.truetype(font_path,38)
def layout(size):
    f=ImageFont.truetype(font_path,size);lines=['']
    for char in text:
        if f.getlength(lines[-1]+char)>460: lines.append('')
        lines[-1]+=char
    return f,lines
for size in range(38,17,-1):
    font,lines=layout(size)
    if len(lines)*(size+8)<=103:break
def frame(offset):
    image=Image.new('RGB',(512,512),'#f5fbff')
    image.paste(picture,((512-picture.width)//2,10+offset),picture)
    draw=ImageDraw.Draw(image)
    y=402+(103-len(lines)*(font.size+8))//2
    for line in lines:
        draw.text(((512-font.getlength(line))/2,y),line,font=font,fill='#134863')
        y+=font.size+8
    return image
animated=bool(args.get('animated'))
file=out/(uuid.uuid4().hex+('.gif' if animated else '.png'))
if animated:
    frames=[frame(round(4*math.sin(i*math.pi/8))).quantize(colors=128) for i in range(16)]
    frames[0].save(file,save_all=True,append_images=frames[1:],duration=80,loop=0)
else: frame(0).save(file)
check=Image.open(file)
assert check.size==(512,512) and file.stat().st_size<5*1024*1024
print(json.dumps(dict(file=str(file),format=check.format,width=512,height=512,frames=getattr(check,'n_frames',1),bytes=file.stat().st_size,caption=text),ensure_ascii=False))
