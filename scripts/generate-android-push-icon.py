from pathlib import Path
from io import BytesIO
from urllib.request import urlopen
from PIL import Image

root = Path(__file__).resolve().parents[1]
source_path = root / "assets" / "icon.png"
if source_path.exists():
    source = Image.open(source_path).convert("RGBA")
else:
    with urlopen(
        "https://files.manuscdn.com/user_upload_by_module/session_file/310519663809348774/cBQkYfNchSuunZhX.png"
    ) as response:
        source = Image.open(BytesIO(response.read())).convert("RGBA")
alpha = source.getchannel("A")
white = Image.new("RGBA", source.size, (255, 255, 255, 0))
white.putalpha(alpha)

for density, canvas_size in {
    "mdpi": 24,
    "hdpi": 36,
    "xhdpi": 48,
    "xxhdpi": 72,
    "xxxhdpi": 96,
}.items():
    content_size = round(canvas_size * 0.78)
    icon = white.copy()
    icon.thumbnail((content_size, content_size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (255, 255, 255, 0))
    canvas.alpha_composite(icon, ((canvas_size - icon.width) // 2, (canvas_size - icon.height) // 2))
    output_dir = root / "android" / "app" / "src" / "main" / "res" / f"drawable-{density}"
    output_dir.mkdir(parents=True, exist_ok=True)
    canvas.save(output_dir / "ic_stat_echat.png", optimize=True)
