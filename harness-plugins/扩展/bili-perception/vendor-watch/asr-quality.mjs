// From Sacredbluedragon/dsh-bili-watch 0.2.23, MIT; exported for local integration.
function normalizeSpeech(s) {
  return String(s || '').replace(/[\s，。、！？；：,.!?;:"'（）()【】]/g, '')
}
export function verifyAsr(payload) {
  const segs = Array.isArray(payload?.segments) ? payload.segments : []
  const vad = payload?.vad || {}
  const text = String(payload?.text || '').trim()
  const reasons = []
  let suspect = false
  if (vad.ok && Number(vad.sec) < 0.5 && text) {
    suspect = true
    reasons.push(`VAD 只测到 ${vad.sec}s 人声，却转出 ${text.length} 字`)
  }
  const byText = new Map()
  for (const s of segs) {
    const k = normalizeSpeech(s.text)
    if (!k || k.length < 6) continue
    if (!byText.has(k)) byText.set(k, [])
    byText.get(k).push(s)
  }
  // 同一句被 Whisper 切成相邻几段很常见（停顿 < 2 秒），只有隔开 ≥2 秒才算「独立时间窗」；
  // 而且只有这种重复占全片一半以上才判幻觉——口播里反复强调同一句话是正常表达。
  const dupInfo = []
  let dupSegs = 0
  for (const [k, list] of byText) {
    if (list.length < 2) continue
    let indep = 0
    for (let i = 1; i < list.length; i++) {
      if (Number(list[i].start) - Number(list[i - 1].end) >= 2) indep++
    }
    if (!indep) continue
    dupSegs += list.length
    dupInfo.push(`「${k.slice(0, 14)}」出现在 ${list.map((x) => x.start + 's').join(' / ')}`)
  }
  if (dupInfo.length && dupSegs * 2 >= segs.length) {
    suspect = true
    reasons.push(`同一段文本反复出现在隔开的时间窗（${dupInfo.slice(0, 2).join('；')}）`)
  }
  const ns = segs.filter((s) => Number(s.no_speech_prob) > 0.5).length
  if (segs.length && ns * 2 >= segs.length) reasons.push(`${ns}/${segs.length} 段 no_speech_prob>0.5`)
  return { suspect, reasons, segments: segs.length, speechSec: vad.ok ? Number(vad.sec) : null }
}

