import type { ExpressionMood, EyeState, MouthViseme } from '../types/hermes';

export const ASCII_WIDTH = 46;

export interface AsciiRenderOptions {
  mood: ExpressionMood;
  viseme: MouthViseme;
  eyeState: EyeState;
  energy: number; // 0..1 audio amplitude
  tick: number;   // animation frame counter
}

const EYE_PATTERNS: Record<EyeState, { left: string; right: string; browL: string; browR: string }> = {
  open:  { browL: '___', browR: '___', left: '(◉)', right: '(◉)' },
  blink: { browL: '___', browR: '___', left: '═══', right: '═══' },
  half:  { browL: '\\__', browR: '__/', left: '(─)', right: '(─)' },
  wide:  { browL: '/¯¯', browR: '¯¯\\', left: '(◎)', right: '(◎)' },
  happy: { browL: '⌒ ', browR: ' ⌒', left: '^ ^', right: '^ ^' },
  side:  { browL: '___', browR: '¯¯¯', left: '(◉ ', right: ' ◉)' },
};

const MOUTH_PATTERNS: Record<MouthViseme, string> = {
  closed: '  ───  ',
  smile:  '  ╰─╯  ',
  small:  '  ╰o╯  ',
  mid:    '  (◯)  ',
  wide:   ' ╰═══╯ ',
  round:  '  (O)  ',
};

/**
 * Maps instantaneous audio RMS amplitude (0..1), current mood, and frame tick
 * into a realistic animated MouthViseme for real-time lip synchronization.
 */
export function amplitudeToViseme(
  amplitude: number,
  mood: ExpressionMood,
  tick: number,
  isSpeaking: boolean
): MouthViseme {
  if (!isSpeaking) {
    if (mood === 'happy') return 'smile';
    if (mood === 'alert') return 'small';
    return 'closed';
  }

  const clamped = Math.max(0, Math.min(1, amplitude));
  // Richer syllable cadence across A/H (small), O/Oh (round), mid, and E/I (wide)
  const syllableWave = Math.sin(tick * 0.85);
  const syllableMod = (syllableWave + 1) * 0.11;
  const level = Math.min(1, clamped + syllableMod);

  if (level < 0.07) return 'closed';
  if (level < 0.22) return 'small';
  if (level < 0.44) {
    if (tick % 4 === 0) return 'round';
    if (tick % 3 === 0) return 'small';
    return 'mid';
  }
  if (level < 0.72) {
    if (tick % 5 === 0) return 'round';
    if (tick % 3 === 1) return 'wide';
    return 'mid';
  }
  return tick % 6 === 0 ? 'round' : 'wide';
}

/**
 * Resolves the character's eye state from mood, speaking state, and animation tick.
 */
export function resolveEyeState(mood: ExpressionMood, tick: number, isSpeaking: boolean): EyeState {
  // 4-step blinking rhythm: open -> half -> blink -> half -> open
  const blinkCycle = tick % 64;
  if (blinkCycle === 60 || blinkCycle === 63) {
    return 'half';
  }
  if (blinkCycle === 61 || blinkCycle === 62) {
    return 'blink';
  }

  if (mood === 'happy') return 'happy';
  if (mood === 'alert') return 'wide';
  if (mood === 'thinking') return tick % 24 < 12 ? 'side' : 'half';
  if (mood === 'focused') return 'half';
  if (mood === 'listening' && tick % 18 === 0) return 'wide';
  if (isSpeaking && tick % 29 === 0) return 'happy';
  return 'open';
}

function padCenter(content: string, width: number = ASCII_WIDTH): string {
  if (content.length === width) return content;
  if (content.length > width) return content.slice(0, width);
  const totalPad = width - content.length;
  const left = Math.floor(totalPad / 2);
  const right = totalPad - left;
  return ' '.repeat(left) + content + ' '.repeat(right);
}

/**
 * Renders the Hermes Duet "Nous Girl" cyber-messenger ASCII character portrait.
 * All lines are strictly normalized to ASCII_WIDTH columns to guarantee zero jitter.
 */
export function renderNousGirlAscii(opts: AsciiRenderOptions): string[] {
  const { mood, viseme, eyeState, energy, tick } = opts;
  const eyes = EYE_PATTERNS[eyeState];
  const mouth = MOUTH_PATTERNS[viseme];

  const activeEnergy = Math.max(0, Math.min(1, energy));
  const phase = tick % 4;
  const sparkA = activeEnergy > 0.35 ? (phase % 2 === 0 ? '✦' : '·') : phase === 0 ? '·' : ' ';
  const sparkB = activeEnergy > 0.55 ? (phase % 2 === 1 ? '✧' : '*') : ' ';
  const wingTipL = activeEnergy > 0.25 && phase < 2 ? '≪' : '«';
  const wingTipR = activeEnergy > 0.25 && phase < 2 ? '≫' : '»';

  const cheekL = mood === 'happy' ? '〃' : mood === 'listening' ? '≈' : ' ';
  const cheekR = mood === 'happy' ? '〃' : mood === 'listening' ? '≈' : ' ';
  const visorMark = mood === 'thinking' ? '◈' : mood === 'alert' ? '!' : '◊';
  const chinTag = mood === 'speaking' ? ' ·───· ' : '       ';
  const pulseBar =
    activeEnergy > 0.65
      ? '▓▓▓'
      : activeEnergy > 0.35
      ? '▒▒▒'
      : activeEnergy > 0.12
      ? '░░░'
      : '───';

  // Symmetrically aligned winged messenger crest, face, eyes, nose, viseme mouth, & collar
  const rawLines = [
    `      ${sparkA}       ▄▄████████▄▄       ${sparkB}      `,
    `    ${wingTipL}══╗   ▄██▀▀      ▀▀██▄   ╔══${wingTipR}    `,
    `   /███╗ ▄██▀  ▄██${visorMark}██▄  ▀██▄ ╔███\\   `,
    `  /████╚▄█▀  ▄██████████▄  ▀█▄╝████\\  `,
    `  \\█████▀   ███▀  ██  ▀███   ▀█████/  `,
    `   \\██▀    ██▀  ${eyes.browL}    ${eyes.browR}  ▀██    ▀██/   `,
    `    ▀│    ██▌   ${eyes.left}    ${eyes.right}   ▐██    │▀    `,
    `     │    ██  ${cheekL}     ╷╷     ${cheekR}  ██    │     `,
    `   ${sparkB} │    ██▄    ${mouth}    ▄██    │ ${sparkA}   `,
    `     │     ▀██▄  ${chinTag}  ▄██▀     │     `,
    `     ╰──    ▀███▄  ──  ▄███▀    ──╯     `,
    `             ▀███▄▄▄▄▄▄███▀             `,
    `           ▄█▀  ║${pulseBar}║  ▀█▄           `,
    `         ▄██▀  ▄╚════╝▄  ▀██▄         `,
    `       ▄██▀  ▄█▀  ${visorMark}   ▀█▄  ▀██▄       `,
    `      ███   ██   /  \\   ██   ███      `,
    `     ▐██▌   ██  /    \\  ██   ▐██▌     `,
    `     ███    ▀█▄/──────\\▄█▀    ███     `,
  ];

  return rawLines.map((line) => padCenter(line, ASCII_WIDTH));
}
