#!/usr/bin/env python3
"""홈 리뉴얼 이미지 생성기 — citycanvas scripts/gen_landing_images.py 방식.

    make images                          # 루트 .env 의 OPENAI_API_KEY 를 읽는다
    make images SLOTS=hero               # 한 장만 다시
    python3 scripts/gen_images.py --dry-run [슬롯…]   # 키·네트워크 없이 계획만 출력

- 모델은 OPENAI_IMAGE_MODEL (기본 gpt-image-2), `/v1/images/generations`. 응답은 base64.
- 슬롯·프롬프트는 scripts/image_prompts.json. 공통 제약(guard)을 모든 프롬프트 뒤에 붙인다.
  컷에는 글자·로고·실제 얼굴이 없어야 한다 — 문구는 전부 DOM 이 얹는다.
- 결과는 public/images/renewal/<file> (webp, 장당 ≤300KB) + manifest.json.
  컴포넌트는 매니페스트의 width/height 를 쓴다.
- 키가 없으면 아무것도 만들지 않고 정상 종료한다. 화면은 같은 비율의 빈 프레임으로 돈다.
- 예산: 시안 포함 누적 30장. 매니페스트의 generated_total 이 30 에 닿으면 생성을 거부한다.

stdlib 만 쓴다. 줄이기는 cwebp 가 있을 때만 (없으면 원본 유지 + 경고).
"""

from __future__ import annotations

import base64
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROMPTS = ROOT / "scripts" / "image_prompts.json"
OUT_DIR = ROOT / "public" / "images" / "renewal"
MANIFEST = OUT_DIR / "manifest.json"

API_URL = "https://api.openai.com/v1/images/generations"
MAX_BYTES = 300 * 1024
MAX_EDGE = 1600
BUDGET = 30  # 시안 포함 누적 생성 상한 (design.md 이미지)


def load_env() -> None:
    """루트 .env → 환경변수. 이미 들어 있는 값은 덮지 않는다."""
    path = ROOT / ".env"
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip("\"'"))


def load_slots() -> tuple[dict, list[dict]]:
    """공통 제약 묶음과 슬롯. 슬롯의 "guard": "paper" 는 guard_paper (밝은 섹션용), 없으면 guard."""
    data = json.loads(PROMPTS.read_text())
    guards = {k.removeprefix("guard_") if k != "guard" else "": v for k, v in data.items() if k.startswith("guard")}
    return guards, data["slots"]


def webp_dims(p: Path) -> tuple[int, int]:
    """외부 도구 없이 webp 헤더에서 폭·높이를 읽는다 (VP8X / VP8 / VP8L)."""
    b = p.read_bytes()[:64]
    if b[:4] != b"RIFF" or b[8:12] != b"WEBP":
        return 0, 0
    if b[12:16] == b"VP8X":
        return int.from_bytes(b[24:27], "little") + 1, int.from_bytes(b[27:30], "little") + 1
    if b[12:16] == b"VP8 ":
        return (int.from_bytes(b[26:28], "little") & 0x3FFF,
                int.from_bytes(b[28:30], "little") & 0x3FFF)
    if b[12:16] == b"VP8L":
        bits = int.from_bytes(b[21:25], "little")
        return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    return 0, 0


def crop_box(w: int, h: int, ratio: str | None) -> tuple[int, int, int, int] | None:
    """"16:7" 같은 비율로 가운데를 잘라낼 (x, y, cw, ch). 비율이 없으면 None."""
    if not ratio:
        return None
    rw, rh = (int(x) for x in ratio.split(":"))
    if w * rh > h * rw:  # 너무 넓다 → 좌우를 자른다
        cw, ch = h * rw // rh, h
    else:  # 너무 높다 → 위아래를 자른다
        cw, ch = w, w * rh // rw
    return (w - cw) // 2, (h - ch) // 2, cw, ch


def shrink(path: Path, ratio: str | None) -> tuple[int, int]:
    """비율대로 자르고 긴 변 MAX_EDGE, 파일 MAX_BYTES 안으로 줄인다. (폭, 높이)를 돌려준다."""
    w, h = webp_dims(path)
    if not shutil.which("cwebp") or not w:
        print("  ! cwebp 가 없거나 webp 가 아니라 원본 그대로 둡니다 (≤300KB 미보장)", file=sys.stderr)
        return w, h

    box = crop_box(w, h, ratio)
    cw, ch = (box[2], box[3]) if box else (w, h)
    scale = min(1.0, MAX_EDGE / max(cw, ch))
    nw, nh = round(cw * scale), round(ch * scale)

    tmp = path.with_suffix(".tmp.webp")
    for q in (80, 72, 64, 56, 48, 40):
        cmd = ["cwebp", "-quiet", "-q", str(q)]
        if box:
            cmd += ["-crop", *(str(v) for v in box)]
        cmd += ["-resize", str(nw), str(nh), str(path), "-o", str(tmp)]
        r = subprocess.run(cmd, capture_output=True)
        if r.returncode != 0 or not tmp.exists():
            print(f"  ! cwebp 실패: {r.stderr[:200]!r}", file=sys.stderr)
            return w, h
        if tmp.stat().st_size <= MAX_BYTES or q == 40:
            tmp.replace(path)
            return nw, nh
        tmp.unlink(missing_ok=True)
    return w, h


def generate(api_key: str, model: str, quality: str, spec: dict, guard: str) -> bytes:
    payload = {
        "model": model,
        "prompt": f"{spec['prompt']} {guard}".strip(),
        "size": spec["size"],
        "quality": quality,
        "output_format": "webp",
        "n": 1,
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=600) as res:
        data = json.load(res)
    item = data["data"][0]
    if "b64_json" in item:
        return base64.b64decode(item["b64_json"])
    with urllib.request.urlopen(item["url"], timeout=180) as res:
        return res.read()


def write_manifest(manifest: dict, slots: list[dict], images: dict) -> None:
    manifest["note"] = (
        "홈 리뉴얼 이미지 등재부. 여기 없는 슬롯은 같은 비율의 빈 프레임으로 렌더된다. "
        "채우는 방법: make images (scripts/gen_images.py)"
    )
    manifest["budget"] = BUDGET
    manifest["slots"] = [s["slot"] for s in slots]
    manifest["images"] = [images[s["slot"]] for s in slots if s["slot"] in images]
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")


def main() -> int:
    argv = sys.argv[1:]
    dry = "--dry-run" in argv
    only = {a for a in argv if not a.startswith("-")}

    load_env()
    model = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-2")
    quality = os.environ.get("OPENAI_IMAGE_QUALITY", "high")
    guards, slots = load_slots()

    unknown = only - {s["slot"] for s in slots}
    if unknown:
        print(f"없는 슬롯: {', '.join(sorted(unknown))}", file=sys.stderr)
        return 2
    targets = [s for s in slots if not only or s["slot"] in only]

    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    used = int(manifest.get("generated_total", 0))

    if dry:
        print(f"[dry-run] {model} · {quality} → {OUT_DIR.relative_to(ROOT)}/ (누적 {used}/{BUDGET})")
        for s in targets:
            crop = f" → {s['crop']}" if s.get("crop") else ""
            print(f"  {s['slot']}: {s['file']} {s['size']}{crop} · alt {s['alt']!r} · 프롬프트 {len(s['prompt'])}자")
        return 0

    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        print(
            "OPENAI_API_KEY 가 없어 이미지를 만들지 않았습니다.\n"
            "화면은 같은 비율의 빈 프레임으로 계속 동작합니다.\n"
            "  루트 .env 에 OPENAI_API_KEY=… 를 넣고 `make images`",
            file=sys.stderr,
        )
        return 0

    if used + len(targets) > BUDGET:
        print(f"예산 초과: 누적 {used}장 + 이번 {len(targets)}장 > {BUDGET}장. 생성하지 않습니다.", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    images = {e["slot"]: e for e in manifest.get("images", [])}
    made = failed = 0
    for spec in targets:
        print(f"· {spec['slot']} 생성 중… ({model} · {spec['size']} · {quality})")
        try:
            raw = generate(key, model, quality, spec, guards[spec.get("guard", "")])
        except urllib.error.HTTPError as e:
            print(f"  실패 {e.code}: {e.read()[:300]!r}", file=sys.stderr)
            failed += 1
            continue
        except (urllib.error.URLError, TimeoutError, KeyError, ValueError) as e:
            print(f"  실패: {e}", file=sys.stderr)
            failed += 1
            continue
        finally:
            # 요청이 나갔으면 실패해도 과금될 수 있다 — 예산은 시도 기준으로 센다
            used += 1
            manifest["generated_total"] = used

        path = OUT_DIR / spec["file"]
        path.write_bytes(raw)
        w, h = shrink(path, spec.get("crop"))
        if not w:
            w, h = (int(x) for x in spec["size"].split("x"))
        images[spec["slot"]] = {
            "slot": spec["slot"],
            "file": spec["file"],
            "width": w,
            "height": h,
            "bytes": path.stat().st_size,
            "alt": spec["alt"],
            "decorative": bool(spec.get("decorative")),
            "prompt": spec["prompt"],
            "model": model,
            "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        made += 1
        print(f"  → {path.relative_to(ROOT)} ({w}×{h}, {path.stat().st_size // 1024}KB)")

    write_manifest(manifest, slots, images)
    print(f"\n{made}장 생성 · 실패 {failed} · 누적 {used}/{BUDGET}")
    print("컷에 글자·로고·얼굴이 보이면 그 파일을 지우고 슬롯을 지정해 다시 돌리세요.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
