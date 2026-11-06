#!/usr/bin/env python3
"""Reproducible benign low-resolution text OCR check (Pillow + Tesseract)."""
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter
from pathlib import Path
import subprocess, json, hashlib

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT / "fixtures"
FIXTURES.mkdir(exist_ok=True)
EXAMPLES = [
    ("sample_a", "Serial: R7d_kite", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", (250,250,250), (35,35,35), 15, .72),
    ("sample_b", "burst=amber_92", "/usr/share/fonts/truetype/lato/Lato-Medium.ttf", (222,238,250), (24,52,88), 14, .68),
    ("ambiguity_control", "Serial: O0l1-58", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", (255,255,255), (0,0,0), 14, .72),
]
results=[]
for name, expected, font_path, bg, fg, size, scale in EXAMPLES:
    font=ImageFont.truetype(font_path,size)
    bounds=font.getbbox(expected)
    w,h=bounds[2]-bounds[0]+8,bounds[3]-bounds[1]+8
    image=Image.new("RGB",(w,h),bg)
    ImageDraw.Draw(image).text((4-bounds[0],4-bounds[1]),expected,font=font,fill=fg)
    image=image.resize((round(w*scale),round(h*scale)),Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.12))
    fixture=FIXTURES/f"{name}.png"
    image.save(fixture)
    channels={"gray":ImageOps.grayscale(image),"r":image.getchannel("R"),"g":image.getchannel("G"),"b":image.getchannel("B")}
    per=[]
    for channel,plane in channels.items():
        plane=ImageOps.autocontrast(plane,cutoff=0)
        variants={"native":plane,"lanczos4":plane.resize((plane.width*4,plane.height*4),Image.Resampling.LANCZOS),"nearest4":plane.resize((plane.width*4,plane.height*4),Image.Resampling.NEAREST)}
        for method,variant in variants.items():
            for psm in ("7",):
                # Use a temporary PNG path for compatibility across Tesseract builds.
                tmp=ROOT/"_ocr_input.png"; variant.save(tmp)
                proc=subprocess.run(["tesseract",str(tmp),"stdout","--psm",psm,"-c","preserve_interword_spaces=1"],capture_output=True,text=True,check=True)
                recognized=proc.stdout.strip().replace("\n"," ")
                row={"example":name,"channel":channel,"scale":method,"psm":int(psm),"expected":expected,"recognized":recognized,"exact":recognized==expected}
                results.append(row);per.append(row)
    fixture_hash=hashlib.sha256(fixture.read_bytes()).hexdigest()
    print(f"{name}: {sum(r['exact'] for r in per)}/{len(per)} exact; fixture_sha256={fixture_hash}")
(ROOT/"_ocr_input.png").unlink(missing_ok=True)
(ROOT/"results.json").write_text(json.dumps(results,indent=2)+"\n")
print(f"tesseract={subprocess.run(['tesseract','--version'],capture_output=True,text=True).stdout.splitlines()[0]}")
