param([Parameter(Mandatory=$true)][string]$InputJson)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Speech
Add-Type -ReferencedAssemblies ([System.Speech.Synthesis.SpeechSynthesizer].Assembly.Location) -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Speech.Synthesis;
public class LianWordMark {
  public double StartSeconds;
  public int CharacterPosition;
}
public class LianOfflineVoice {
  public static List<LianWordMark> Render(string text, string file, string voice, int rate, int volume) {
    var marks = new List<LianWordMark>();
    using (var synth = new SpeechSynthesizer()) {
      synth.SelectVoice(voice); synth.Rate=rate; synth.Volume=volume;
      synth.SpeakProgress += (sender,e) => {lock(marks) marks.Add(new LianWordMark {StartSeconds=e.AudioPosition.TotalSeconds, CharacterPosition=e.CharacterPosition});};
      synth.SetOutputToWaveFile(file);
      synth.Speak(text);
      synth.SetOutputToNull();
    }
    return marks;
  }
}
'@
$request=Get-Content -LiteralPath $InputJson -Raw -Encoding UTF8 | ConvertFrom-Json
$marks=[LianOfflineVoice]::Render([string]$request.text,[string]$request.audio,[string]$request.voice,[int]$request.rate,[int]$request.volume)
ConvertTo-Json -InputObject @($marks) -Compress -Depth 4
