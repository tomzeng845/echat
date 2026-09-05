from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "android" / "app" / "src" / "main" / "res" / "raw"
SAMPLE_RATE = 44_100


def envelope(position: float, duration: float) -> float:
    attack = min(1.0, position / 0.018)
    release = min(1.0, max(0.0, duration - position) / 0.11)
    return attack * release


def render(path: Path, duration: float, notes: list[tuple[float, float, tuple[float, ...], float]]) -> None:
    samples: list[int] = []
    for index in range(round(duration * SAMPLE_RATE)):
        time = index / SAMPLE_RATE
        value = 0.0
        for start, length, frequencies, gain in notes:
            local = time - start
            if 0 <= local < length:
                tone = sum(math.sin(2 * math.pi * frequency * local) for frequency in frequencies) / len(frequencies)
                value += tone * gain * envelope(local, length)
        value = max(-0.92, min(0.92, value))
        samples.append(round(value * 32_767))

    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(b"".join(struct.pack("<h", sample) for sample in samples))


render(
    OUTPUT / "echat_message.wav",
    0.52,
    [
        (0.00, 0.24, (880.0, 1320.0), 0.42),
        (0.22, 0.25, (1174.66, 1760.0), 0.34),
    ],
)
render(
    OUTPUT / "echat_call.wav",
    2.40,
    [
        (0.00, 0.62, (440.0, 659.25), 0.42),
        (0.78, 0.62, (523.25, 783.99), 0.42),
        (1.56, 0.62, (440.0, 659.25), 0.42),
    ],
)

print(OUTPUT / "echat_message.wav")
print(OUTPUT / "echat_call.wav")
