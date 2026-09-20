import os
import sys
import subprocess
import shutil
from pathlib import Path
from PIL import Image, ImageDraw

def create_squircle_mask(size, radius_ratio=0.225):
    # Continuous squircle corner mask with ~22.5% radius
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    r = int(size * radius_ratio)
    draw.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=r, fill=255)
    return mask

def main():
    output_dir = Path("app/resources")
    build_dir = Path("app/build")
    output_dir.mkdir(parents=True, exist_ok=True)
    build_dir.mkdir(parents=True, exist_ok=True)

    source_img_path = Path(sys.argv[1]) if len(sys.argv) > 1 else output_dir / "icon.png"
    if not source_img_path.exists():
        print(f"Source icon not found at {source_img_path}. Pass image path: python generate_app_icons.py <path>")
        return

    img = Image.open(source_img_path).convert("RGBA")
    # Find bounding box of the squircle tile in the image
    # In 1024x1024, the squircle tile spans approximately from [158, 158] to [866, 866]
    # Let's crop to the squircle area with a slight border
    # Crop to central 820x820 area:
    w, h = img.size
    crop_size = 800
    left = (w - crop_size) // 2
    top = (h - crop_size) // 2
    right = left + crop_size
    bottom = top + crop_size
    cropped = img.crop((left, top, right, bottom))

    # Resize to standard 1024x1024
    icon_1024 = cropped.resize((1024, 1024), Image.Resampling.LANCZOS)
    
    # Apply rounded corner mask so corners are transparent
    mask = create_squircle_mask(1024, radius_ratio=0.22)
    icon_transparent = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    icon_transparent.paste(icon_1024, (0, 0), mask=mask)

    # Save master 1024x1024 PNG
    master_png = output_dir / "icon.png"
    icon_transparent.save(master_png, "PNG")
    shutil.copy2(master_png, build_dir / "icon.png")
    print(f"Saved: {master_png}")

    # Generate multi-size ICO for Windows
    ico_path = output_dir / "icon.ico"
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    icon_transparent.save(ico_path, format="ICO", sizes=ico_sizes)
    shutil.copy2(ico_path, build_dir / "icon.ico")
    print(f"Saved: {ico_path}")

    # Generate macOS ICNS via iconutil
    iconset_dir = output_dir / "icon.iconset"
    if iconset_dir.exists():
        shutil.rmtree(iconset_dir)
    iconset_dir.mkdir(parents=True, exist_ok=True)

    sizes_map = [
        ("icon_16x16.png", 16),
        ("icon_16x16@2x.png", 32),
        ("icon_32x32.png", 32),
        ("icon_32x32@2x.png", 64),
        ("icon_128x128.png", 128),
        ("icon_128x128@2x.png", 256),
        ("icon_256x256.png", 256),
        ("icon_256x256@2x.png", 512),
        ("icon_512x512.png", 512),
        ("icon_512x512@2x.png", 1024),
    ]

    for name, s in sizes_map:
        resized = icon_transparent.resize((s, s), Image.Resampling.LANCZOS)
        resized.save(iconset_dir / name, "PNG")

    icns_path = output_dir / "icon.icns"
    try:
        subprocess.run(["iconutil", "-c", "icns", str(iconset_dir), "-o", str(icns_path)], check=True)
        shutil.copy2(icns_path, build_dir / "icon.icns")
        print(f"Saved: {icns_path}")
        shutil.rmtree(iconset_dir)
    except Exception as e:
        print(f"Warning: iconutil failed ({e})")

    print("App icon generation complete!")

if __name__ == "__main__":
    main()
