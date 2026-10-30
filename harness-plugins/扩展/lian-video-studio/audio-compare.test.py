import importlib.util,unittest
from pathlib import Path
s=importlib.util.spec_from_file_location('comparison',Path(__file__).with_name('audio-compare.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Checks(unittest.TestCase):
 def test_punctuation(self):self.assertTrue(m.compare('你好，朋友！','你好朋友')['matchesNormalized'])
 def test_differences_uncertain(self):
  r=m.compare('不要跳过这个词','不要跳这个词');self.assertTrue(r['possibleDifferences']);self.assertIn('不是已经证实',r['notice'])
 def test_word_timing_and_partial_captions(self):
  r=m.analyze(dict(duration=2,offset=10,expectedText='你好',segments=[dict(start=.2,end=1,text='你好',words=[dict(start=.2,end=.5,word='你'),dict(start=.5,end=1,word='好')])],captions=[dict(start=10,end=10.5,text='你'),dict(start=0,end=1,text='不在选中范围')]))
  self.assertEqual(r['segments'][0]['start'],10.2);self.assertEqual(r['captionChecks'][0]['recognized'],'你');self.assertFalse(r['captionChecks'][1]['withinAnalyzedRange']);self.assertFalse(r['hearingOrAestheticJudgment'])
 def test_empty_asr_not_speech_absent(self):
  r=m.analyze(dict(duration=1,segments=[],expectedText='有台词'));self.assertFalse(r['usable']);self.assertIsNone(r['expectedComparison'])
 def test_window_confidence_not_sentence_score(self):
  r=m.analyze(dict(duration=2,segments=[dict(start=0,end=1,text='你好',avg_logprob=-1.2,no_speech_prob=.1,seek=0),dict(start=1,end=2,text='朋友',avg_logprob=-1.2,no_speech_prob=.1,seek=0)]))
  self.assertEqual(r['segments'][0]['windowAvgLogprob'],-1.2);self.assertNotIn('avg_logprob',r['segments'][0]);self.assertEqual(r['segments'][1]['decoderWindowSeek'],0);self.assertIn('独立质量分',r['uncertainSegments'][0]['reason'])
if __name__=='__main__':unittest.main(verbosity=2)
