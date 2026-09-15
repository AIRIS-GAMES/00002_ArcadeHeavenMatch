import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Offline PCM rendering only. Preserve the original pitches, envelopes and timing.
const directory = fileURLToPath(new URL("../Asset/standard/audio/", import.meta.url));
mkdirSync(directory, { recursive: true });
const penta = [523, 587, 659, 784, 880, 1047, 1175, 1319];
const sounds = {
  swap: [[440,.08,"triangle",.18], [660,.06,"sine",.08,.025]],
  deny: [[180,.12,"triangle",.12]],
  bell: [[1568,.34,"triangle",.24], [2093,.38,"sine",.16,.06]],
  bomb: [[196,.12,"triangle",.28], [98,.22,"sine",.2,.03], [784,.14,"triangle",.12,.08]],
  time: [[880,.12,"sine",.18], [1175,.14,"triangle",.14,.06], [1568,.16,"sine",.12,.13]],
  color: [523,659,784,1047,1319].map((f,i)=>[f,.12,"sine",.13,i*.045]),
  stage: [0,2,4,5].map((n,i)=>[penta[n],.3,"sine",.19,i*.12]),
  lose: [[392,.25,"sine",.16], [311,.35,"sine",.16,.2]],
  horror: [[330,.12,"triangle",.12], [247,.16,"sine",.10,.06]]
};
for(let i=0;i<6;i++){
  sounds["clear-"+i] = [[penta[i],.18,"sine",.22], [penta[i+2],.22,"sine",.14,.05]];
  sounds["coin-"+i] = Array.from({length:i+5}, (_,j)=>[
    [1040+j*60,.075,"triangle",.12,j*.05],
    [1560+j*82,.045,"sine",.07,j*.05+.014]
  ]).flat();
}
for(let i=0;i<10;i++) sounds["tick-"+i] = [[660+i*36,.09,"triangle",.16]];
// Every effect is normalized to the same peak; relative balance comes from SFX_VOLUMES in
// index.html. This level is what iOS screen recording captures, because the recorder taps
// app audio before the hardware volume control: a quiet mix records into the noise floor and
// plays back as crackle however loud the phone is. The previous 0.08 recorded at -30 dBFS,
// about 28 dB below the reference game. Raising this needs the headroom check in
// tests/audio.test.js to stay green.
const SFX_PEAK = 0.5;
const rate = 44100;
for(const [name, notes] of Object.entries(sounds)){
  const length = Math.ceil((Math.max(...notes.map(([,d,,,w=0])=>d+w))+.01)*rate);
  const samples = new Float64Array(length);
  for(const [frequency, duration, type, volume, delay=0] of notes){
    for(let n=Math.ceil(delay*rate);n<Math.min(length,Math.ceil((delay+duration)*rate));n++){
      const t=n/rate-delay;
      const phase=2*Math.PI*frequency*t;
      let wave=Math.sin(phase);
      if(type==="triangle"){
        wave=0;
        for(let harmonic=1;harmonic*frequency<rate/2;harmonic+=2){
          wave+=8/Math.PI**2 * (-1)**((harmonic-1)/2) * Math.sin(harmonic*phase)/harmonic**2;
        }
      }
      const peak=volume*.55;
      const envelope=t<.018 ? .001*(peak/.001)**(t/.018) : peak*(.001/peak)**((t-.018)/(duration-.018));
      const fade=Math.min(1,t/.002,(duration-t)/.003);
      samples[n]+=wave*envelope*fade;
    }
  }
  const peak=samples.reduce((p,s)=>Math.max(p,Math.abs(s)),0);
  const scale=SFX_PEAK/peak;
  const wav=Buffer.alloc(44+length*2);
  wav.write("RIFF",0); wav.writeUInt32LE(wav.length-8,4); wav.write("WAVEfmt ",8);
  wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(rate,24); wav.writeUInt32LE(rate*2,28);
  wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34);
  wav.write("data",36); wav.writeUInt32LE(length*2,40);
  samples.forEach((sample,i)=>wav.writeInt16LE(Math.round(sample*scale*32767),44+i*2));
  writeFileSync(directory+name+".wav",wav);
}
console.log(`Generated ${Object.keys(sounds).length} WAV files (PCM16 mono, peak ${SFX_PEAK}).`);
