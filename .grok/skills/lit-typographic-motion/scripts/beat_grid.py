"""Tier 2 beat grid for lit-typographic-motion (MO-A-17..19).

Runs only inside the pre-warmed, hash-pinned venv. Reads the user's own audio file once, before
any render, and writes this run's beat/onset grid as JSON. librosa (ISC) only; never aubio,
essentia or madmom.
"""
import json
import sys


def main(audio_path: str, out_path: str) -> int:
    import librosa  # noqa: PLC0415  (imported inside the pinned venv only)

    signal, rate = librosa.load(audio_path, sr=22050, mono=True)
    tempo, frames = librosa.beat.beat_track(y=signal, sr=rate, units="frames")
    beats = librosa.frames_to_time(frames, sr=rate).tolist()
    onsets = librosa.onset.onset_detect(y=signal, sr=rate, units="time").tolist()
    duration = float(librosa.get_duration(y=signal, sr=rate))
    bpm = float(tempo[0]) if hasattr(tempo, "__len__") else float(tempo)
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump({"bpm": round(bpm, 3), "beats": [round(b, 4) for b in beats], "onsets": [round(o, 4) for o in onsets], "durationSec": round(duration, 4)}, handle)
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.stderr.write("usage: beat_grid.py <audio file> <out.json>\n")
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2]))
