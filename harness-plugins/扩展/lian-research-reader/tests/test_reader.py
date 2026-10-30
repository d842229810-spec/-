import importlib.util
import io
import json
from pathlib import Path
import unittest
import tempfile
from unittest.mock import patch
from PIL import Image
spec=importlib.util.spec_from_file_location('reader',Path(__file__).parents[1]/'reader.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class ReaderChecks(unittest.TestCase):
    def test_gbk_meta(self):
        html='<meta charset="gb2312"><article>十七岁那一年，故事从这里开始。</article>'
        text,enc=m.decode_html(html.encode('gb18030'),'text/html')
        self.assertIn('十七岁那一年',text)
    def test_not_image_despite_name_and_type(self):
        with self.assertRaisesRegex(ValueError,'不是支持的位图'):
            m.validate_image(b'<!DOCTYPE html><title>429 Too many requests</title>','image/jpeg')
    def test_actual_image(self):
        buf=io.BytesIO();Image.new('RGB',(80,60),'blue').save(buf,'PNG')
        self.assertEqual(m.validate_image(buf.getvalue(),'image/png')['width'],80)
        with self.assertRaisesRegex(ValueError,'Content-Type'):m.validate_image(buf.getvalue(),'text/html')
    def test_pagination(self):
        text='第一段的中文。'*3000
        pieces=[];start=0
        while True:
            r=m.visible_slice(text,start,1000)
            pieces.append(r['text'])
            if r['nextStart'] is None:break
            start=r['nextStart']
        self.assertEqual(''.join(pieces),text)
    def test_private_url_and_local_path(self):
        for value in ['http://example.com/','https://127.0.0.1/','https://user:pass@example.com/']:
            with self.assertRaises(ValueError):m.safe_url(value)
    def test_pdf_real_sample(self):
        r=m.pdf({'source':'E:/LianHome/日志/成长记录/_诺奖2026文学_授奖词.pdf','page':1,'pages':1})
        self.assertEqual(r['totalPages'],4)
        self.assertIn('Speaker',r['pages'][0]['text'])
    def test_429_not_downloaded_as_image(self):
        with patch.object(m,'fetch_bytes',return_value={'ok':False,'httpStatus':429,'retryAfterSeconds':120}):
            r=m.image({'source':'https://upload.wikimedia.org/a.jpg'})
        self.assertFalse(r['ok']);self.assertNotIn('images',r)
    def test_429_retreat_without_repeat_request(self):
        class Response:
            status_code=429
            headers={'Retry-After':'90'}
            def __enter__(self):return self
            def __exit__(self,*_a):pass
        calls=[]
        class Session:
            def get(self,*args,**kwargs):calls.append(args);return Response()
        with tempfile.TemporaryDirectory(prefix='lian-reader-test-') as directory:
            with patch.object(m,'STATE',Path(directory)),patch.object(m,'ORIGINAL_DNS',return_value=[(2,1,6,'',('8.8.8.8',443))]),patch.object(m.requests,'Session',Session):
                first=m.fetch_bytes('https://ratelimit-unit.example/a.jpg',10000)
                second=m.fetch_bytes('https://ratelimit-unit.example/a.jpg',10000)
                self.assertEqual(first['httpStatus'],429);self.assertEqual(second['httpStatus'],429);self.assertEqual(len(calls),1)

if __name__=='__main__':unittest.main()
