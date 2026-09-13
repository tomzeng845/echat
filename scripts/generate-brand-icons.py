from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = Image.open(root / "design/echat-icon-a.png").convert("RGBA")

def resized(size: int) -> Image.Image:
    return source.resize((size, size), Image.Resampling.LANCZOS)

(root / "design/generated-icons").mkdir(parents=True, exist_ok=True)
resized(256).save(root / "design/generated-icons/echat-icon-256.png")
resized(192).save(root / "client/public/favicon.png")

sizes = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
for density, size in sizes.items():
    folder = root / "android/app/src/main/res" / f"mipmap-{density}"
    folder.mkdir(parents=True, exist_ok=True)
    icon = resized(size)
    icon.save(folder / "ic_launcher.png")
    icon.save(folder / "ic_launcher_round.png")
    resized(size * 2).save(folder / "ic_launcher_foreground.png")
    Image.new("RGBA", (size * 2, size * 2), (7, 20, 36, 255)).save(folder / "ic_launcher_background.png")

resized(256).save(
    root / "design/generated-icons/echat.ico",
    format="ICO",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
print("Generated EChat brand icons")
