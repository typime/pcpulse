"""Avtomatik yangilanish.

GitHub relizida PCPulseAgent.exe bilan birga latest.json turadi:
    {"version": "2.2.7", "url": "https://github.com/typime/pcpulse/releases/download/agent-v2.2.7/PCPulseAgent.exe",
     "sha256": "...", "size": 31234567}
Agent uni tekshiradi, yangi exe ni yuklab oladi, hajmi va SHA-256 ni solishtiradi.
Almashtirishni yangi exe ning oʻzi bajaradi (agent.py → apply_update), chunki ishlab turgan faylni ustidan yozib boʻlmaydi.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
import urllib.request

import cloud

ALLOWED_PREFIX = "https://github.com/typime/pcpulse/releases/download/"
MAX_SIZE = 200 * 1024 * 1024


def parse(v: str | None) -> tuple:
    return tuple(int(x) for x in re.findall(r"\d+", str(v or ""))[:4]) or (0,)


def newer(a: str | None, b: str | None) -> bool:
    """a versiyasi b dan yangimi?"""
    return parse(a) > parse(b)


def _open(url: str, ua: str, timeout: float):
    req = urllib.request.Request(url, headers={"User-Agent": ua, "Cache-Control": "no-cache", "Accept": "*/*"})
    return urllib.request.urlopen(req, timeout=timeout)


def fetch_latest(ua: str = "PCPulseAgent", timeout: float = 20) -> dict:
    with _open(cloud.UPDATE_URL, ua, timeout) as r:
        data = json.loads(r.read(65536).decode("utf-8-sig"))
    ver, url, sha, size = data.get("version"), data.get("url"), str(data.get("sha256", "")).lower(), int(data.get("size") or 0)
    if not ver or not isinstance(url, str) or not url.startswith(ALLOWED_PREFIX):
        raise ValueError("latest.json notoʻgʻri")
    if not re.fullmatch(r"[0-9a-f]{64}", sha) or not (1_000_000 < size < MAX_SIZE):
        raise ValueError("latest.json da sha256/hajm notoʻgʻri")
    return {"version": str(ver), "url": url, "sha256": sha, "size": size}


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(info: dict, dest_dir: str, ua: str = "PCPulseAgent", progress=None) -> str:
    """Yangi exe ni dest_dir ga yuklaydi va tekshiradi. Tayyor fayl yoʻlini qaytaradi."""
    os.makedirs(dest_dir, exist_ok=True)
    final = os.path.join(dest_dir, f"PCPulseAgent-{re.sub(r'[^0-9A-Za-z.]', '', info['version'])}.exe")
    if os.path.exists(final) and os.path.getsize(final) == info["size"] and sha256_file(final) == info["sha256"]:
        return final
    part = final + ".part"
    h = hashlib.sha256()
    got = 0
    last = 0.0
    with _open(info["url"], ua, 60) as r, open(part, "wb") as f:
        while True:
            chunk = r.read(1 << 16)
            if not chunk:
                break
            got += len(chunk)
            if got > info["size"]:
                raise ValueError("Fayl kutilganidan katta")
            h.update(chunk)
            f.write(chunk)
            if progress and time.time() - last > 1:
                last = time.time()
                progress(got, info["size"])
    if got != info["size"] or h.hexdigest() != info["sha256"]:
        try:
            os.remove(part)
        except OSError:
            pass
        raise ValueError("Yuklangan fayl buzilgan (SHA-256 mos emas)")
    os.replace(part, final)
    return final


def cleanup(dest_dir: str, keep: str | None = None) -> None:
    try:
        for n in os.listdir(dest_dir):
            p = os.path.join(dest_dir, n)
            if keep and os.path.normcase(p) == os.path.normcase(keep):
                continue
            try:
                os.remove(p)
            except OSError:
                pass  # hali ishlayotgan boʻlishi mumkin — keyingi safar
    except OSError:
        pass
