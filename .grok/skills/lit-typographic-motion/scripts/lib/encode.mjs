// The master encode, pinned exactly (MO-A-03), for either path and either format. A sound track is
// muxed whenever one is given (a generated bed, a supplied or an authored track); it was already
// padded or trimmed to the video's length, so there is no -shortest (brief section 7).
import { spawn } from 'node:child_process';

export const AAC_BITRATE = '256k';

export function masterArgs({ path, width, height, fps, audioFile = null }) {
  // The input side also declares BT.709 primaries/transfer: ffmpeg 8.1 otherwise writes them as
  // unknown despite the pinned output flags. The pinned output arguments below are unchanged.
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-r', String(fps), '-color_primaries', 'bt709', '-color_trc', 'bt709', '-i', 'pipe:0'];
  if (audioFile) args.push('-i', audioFile);
  args.push('-map', '0:v:0');
  if (audioFile) args.push('-map', '1:a:0');
  args.push('-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-tune', 'grain', '-x264-params', 'aq-mode=3',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv');
  if (audioFile) args.push('-c:a', 'aac', '-b:a', AAC_BITRATE);
  args.push('-movflags', '+faststart', path);
  return args;
}

export function startEncode(ffmpeg, options) {
  const proc = spawn(ffmpeg, masterArgs(options), { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (chunk) => { if (stderr.length < 65536) stderr += chunk; });
  const done = new Promise((resolveDone, reject) => proc.on('close', (code) => (code === 0 ? resolveDone() : reject(new Error(`ffmpeg master encode failed (${code}): ${stderr.trim().split('\n').at(-1)}`)))));
  done.catch(() => {});
  return {
    write: (bytes) => new Promise((resolveWrite, reject) => { proc.stdin.write(bytes, (error) => (error ? reject(error) : resolveWrite())); }),
    end: async () => { proc.stdin.end(); await done; },
    abort: () => { try { proc.kill('SIGKILL'); } catch {} },
  };
}
