// Generates narration audio for video/introduction/quantum-guardian-video.html
// with the OpenAI text-to-speech API, one wav file per cue, then optionally
// places every clip at its cue start time in a single track with ffmpeg.
//
//   $env:OPENAI_API_KEY = '...'          # PowerShell; bash: export OPENAI_API_KEY=...
//   node video/tts/generate.mjs --limit 3            # first 3 cues only
//   node video/tts/generate.mjs                      # every cue, skips existing files
//   node video/tts/generate.mjs --voice coral --force
//   node video/tts/generate.mjs --assemble           # out/narration.wav on the timeline
//
// Output: video/tts/out/<NN>.wav, video/tts/out/timeline.json, and with
// --assemble, video/tts/out/narration.wav. The wav files are 24 kHz 16-bit mono.
import {readFileSync, writeFileSync, mkdirSync, existsSync, statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const videoFile = join(here, '..', 'introduction', 'quantum-guardian-video.html');
const outDir = join(here, 'out');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const has = name => args.includes(name);

const model = flag('--model', 'gpt-4o-mini-tts');
const voice = flag('--voice', 'marin');
const limit = Number(flag('--limit', Infinity));
const instructions = flag(
  '--instructions',
  '한국어 발표 영상 나레이션입니다. 차분하고 또렷하게, 보통 속도로 읽습니다. ' +
    '문장 끝은 자연스럽게 내리고, 과장된 감정은 넣지 않습니다. ' +
    'APSP, QUBO, QA, SA, ILS 같은 영어 약어는 알파벳으로 읽습니다.',
);

const cues = loadCues();
mkdirSync(outDir, {recursive: true});
writeFileSync(
  join(outDir, 'timeline.json'),
  JSON.stringify(cues.map((cue, index) => ({index, start: cue[0], end: cue[1], text: cue[2], file: fileName(index)})), null, 1),
);

if (has('--assemble')) {
  assemble(cues);
} else {
  await generate(cues);
}

// The timeline (removals, signpost insertions, baseline scene) is built in the
// page's own script, so the block from `const scenes=[` to `seek.max=duration;`
// runs here with the scene-body helpers stubbed out.
function loadCues() {
  const source = readFileSync(videoFile, 'utf8');
  const start = source.indexOf('const scenes=[');
  const stop = source.indexOf('seek.max=duration;') + 'seek.max=duration;'.length;
  const helpers = ['frame', 'graph', 'mapMorph', 'directionRule', 'apspWhy', 'qaFlow', 'energyScene', 'nhopScatter', 'preprocess', 'resultPlot', 'resultsConclusion'];
  const build = new Function(...helpers, 'seek', source.slice(start, stop) + ';return cues');
  return build(...helpers.map(() => () => ''), {}).filter(cue => cue[2].trim());
}

function fileName(index) {
  return String(index).padStart(2, '0') + '.wav';
}

async function generate(cues) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error('OPENAI_API_KEY 환경 변수가 없습니다.');
    process.exit(1);
  }
  const todo = cues.slice(0, limit);
  let made = 0;
  for (const [index, cue] of todo.entries()) {
    const file = join(outDir, fileName(index));
    if (existsSync(file) && !has('--force')) {
      report(index, cue, file, 'skip');
      continue;
    }
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({model, voice, input: cue[2], instructions, response_format: 'wav'}),
    });
    if (!response.ok) {
      console.error(`cue ${index}: HTTP ${response.status}\n${await response.text()}`);
      process.exit(1);
    }
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    made += 1;
    report(index, cue, file, 'made');
  }
  console.log(`\n생성 ${made}개 · 건너뜀 ${todo.length - made}개 · 출력 ${outDir}`);
  console.log('전체 트랙으로 합치려면: node video/tts/generate.mjs --assemble');
}

// Prints the clip length next to the cue window so an overrun is visible.
function report(index, cue, file, state) {
  const seconds = wavSeconds(file);
  const window = cue[1] - cue[0];
  const over = seconds > window ? `  ← ${(seconds - window).toFixed(1)}초 초과` : '';
  console.log(`${state} ${fileName(index)}  ${cue[0]}–${cue[1]}s (${window}s)  음성 ${seconds.toFixed(1)}s${over}  ${cue[2].slice(0, 28)}`);
}

// 24 kHz, 16-bit, mono PCM: 48000 bytes per second after the 44-byte header.
function wavSeconds(file) {
  return (statSync(file).size - 44) / 48000;
}

function assemble(cues) {
  const present = cues.map((cue, index) => [cue, index]).filter(([, index]) => existsSync(join(outDir, fileName(index))));
  if (!present.length) {
    console.error('out/ 에 wav 파일이 없습니다. 먼저 생성하세요.');
    process.exit(1);
  }
  const inputs = present.flatMap(([, index]) => ['-i', join(outDir, fileName(index))]);
  const delays = present.map(([cue], i) => `[${i}]adelay=${cue[0] * 1000}|${cue[0] * 1000}[a${i}]`).join(';');
  const mix = present.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${present.length}:normalize=0[out]`;
  const target = join(outDir, 'narration.wav');
  const result = spawnSync('ffmpeg', ['-y', ...inputs, '-filter_complex', `${delays};${mix}`, '-map', '[out]', target], {stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`\n${present.length}개 클립을 시간축에 배치했습니다: ${target}`);
}
