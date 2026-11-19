"""Kompyuter holatini tahlil qilish: oddiy, tushunarli xulosa va maslahatlar (oʻzbekcha)."""
from __future__ import annotations

import re

LEVEL_PENALTY = {"ok": 0, "info": 0, "warn": 8, "crit": 20}


def gb(b) -> str:
    if b is None:
        return "?"
    v = b / 1024**3
    return f"{v:.1f} GB" if v < 100 else f"{v:.0f} GB"


def _num(v):
    return v if isinstance(v, (int, float)) else None


def nominal_voltage(name: str) -> float | None:
    n = name.lower().replace(" ", "")
    if "vbat" in n or "cmos" in n or "battery" in n:
        return 3.0
    if re.search(r"12v", n):
        return 12.0
    if re.search(r"(^|[^.\d])5v", n) or "5vsb" in n:
        return 5.0
    if re.search(r"3\.3v|3v3|3vcc|3vsb|avcc|\+3v", n):
        return 3.3
    return None


def classify_voltage(name: str, value: float | None) -> dict:
    nom = nominal_voltage(name)
    if value is None or nom is None:
        return {"nominal": nom, "dev": None, "level": "info"}
    if nom == 3.0:  # CMOS batareyasi
        level = "warn" if value < 2.75 else "ok"
        if value < 2.5:
            level = "crit"
        return {"nominal": nom, "dev": round((value - nom) / nom * 100, 1), "level": level}
    dev = (value - nom) / nom * 100
    a = abs(dev)
    if a <= 5:
        level = "ok"
    elif a <= 8:
        level = "warn"
    elif a <= 25:
        level = "crit"
    else:
        level = "info"  # katta ehtimol bilan sensor masshtabi notoʻgʻri (plata LHM'da toʻliq qoʻllab-quvvatlanmagan)
    return {"nominal": nom, "dev": round(dev, 1), "level": level}


def fmt_uptime(sec: float) -> str:
    sec = int(sec or 0)
    d, rem = divmod(sec, 86400)
    h, rem = divmod(rem, 3600)
    m = rem // 60
    if d:
        return f"{d} kun {h} soat" if h else f"{d} kun"
    if h:
        return f"{h} soat {m} daq"
    return f"{m} daqiqa"


def analyze(snap: dict, sysinfo: dict | None, alerts: dict) -> dict:
    items: list[dict] = []
    sysinfo = sysinfo or {}
    cpu_crit = alerts.get("cpu_temp", 90)
    gpu_crit = alerts.get("gpu_temp", 87)
    ram_crit = alerts.get("ram", 93)
    disk_crit = alerts.get("disk", 95)

    def add(key, level, area, title, detail="", tip=""):
        items.append({"key": key, "level": level, "area": area, "title": title, "detail": detail, "tip": tip})

    procs = (snap.get("procs") or {})
    top_mem = procs.get("by_mem") or []
    top_cpu = procs.get("by_cpu") or []

    # --- CPU ---
    cpu = snap.get("cpu") or {}
    t, load = _num(cpu.get("temp")), _num(cpu.get("load"))
    if t is not None:
        if t >= cpu_crit:
            add("cpu_temp", "crit", "cpu", f"Protsessor juda qizib ketdi: {t:.0f}°C",
                f"Yuklama {load or 0:.0f}%", "Sovutishni tekshiring: chang, termopasta, CPU fani. Ogʻir dasturlarni yoping.")
        elif t >= cpu_crit - 10:
            add("cpu_temp", "warn", "cpu", f"Protsessor issiq: {t:.0f}°C",
                f"Yuklama {load or 0:.0f}%", "Fanlarni “Muvozanat” yoki “Maksimal” rejimga oʻtkazing, korpus ichidagi changni tozalang.")
        else:
            add("cpu_temp", "ok", "cpu", f"Protsessor meʼyorida: {t:.0f}°C", f"Yuklama {load or 0:.0f}%")
    elif load is not None:
        add("cpu_load_basic", "ok", "cpu", f"Protsessor yuklamasi: {load:.0f}%", "Harorat sensori ulanmagan")
    if load is not None and load >= 90:
        who = ", ".join(p.get("title") or p["name"] for p in top_cpu[:2]) or "nomaʼlum"
        add("cpu_load", "warn", "cpu", f"Protsessor {load:.0f}% band", f"Eng koʻp yuklayotgan: {who}",
            "Agar bu dasturlar hozir kerak boʻlmasa — “Jarayonlar” boʻlimidan yoping.")

    # --- GPU ---
    for i, g in enumerate(snap.get("gpus") or []):
        gt, gl = _num(g.get("temp")), _num(g.get("load"))
        name = g.get("name") or f"GPU {i + 1}"
        short = "Videokarta" if i == 0 else f"Videokarta {i + 1}"
        if gt is None:
            continue
        hs = _num(g.get("hotspot"))
        if gt >= gpu_crit or (hs is not None and hs >= 105):
            add(f"gpu_temp_{i}", "crit", "gpu", f"{short} juda qizib ketdi: {gt:.0f}°C", name,
                "Oʻyin/renderni toʻxtating, GPU fanlarini tekshiring, korpus havo aylanishini yaxshilang.")
        elif gt >= gpu_crit - 10 or (hs is not None and hs >= 95):
            add(f"gpu_temp_{i}", "warn", "gpu", f"{short} issiq: {gt:.0f}°C", name,
                "Fan tezligini oshiring yoki FPS cheklovini qoʻying.")
        else:
            add(f"gpu_temp_{i}", "ok", "gpu", f"{short} meʼyorida: {gt:.0f}°C", f"{name} · yuklama {gl or 0:.0f}%")

    # --- RAM ---
    ram = snap.get("ram") or {}
    rp = _num(ram.get("percent"))
    if rp is not None:
        who = ", ".join(f"{p.get('title') or p['name']} ({gb(p.get('mem'))})" for p in top_mem[:3])
        detail = f"{gb(ram.get('used'))} / {gb(ram.get('total'))}"
        if rp >= ram_crit:
            add("ram", "crit", "ram", f"Operativ xotira deyarli toʻla: {rp:.0f}%", detail,
                f"Eng koʻp: {who}. Keraksiz dasturlarni yoping, avtoyuklanishdagi ilovalarni oʻchiring.")
        elif rp >= ram_crit - 8:
            add("ram", "warn", "ram", f"Operativ xotira koʻp band: {rp:.0f}%", detail,
                f"Eng koʻp: {who}. Brauzerda keraksiz tablarni yoping.")
        else:
            add("ram", "ok", "ram", f"Operativ xotira: {rp:.0f}% band", detail)

    # --- Disklar (boʻlimlar) ---
    vol_bad = False
    for v in snap.get("volumes") or []:
        p = _num(v.get("percent"))
        if p is None:
            continue
        mount = (v.get("mount") or "?").rstrip("\\/") or "/"
        if p >= disk_crit:
            vol_bad = True
            add(f"vol_{mount}", "crit", "disk", f"{mount} disk toʻlib qoldi: {p:.0f}%", f"Boʻsh joy: {gb(v.get('free'))}",
                "Boshqaruv → Tozalash, katta fayllarni boshqa diskka koʻchiring.")
        elif p >= disk_crit - 10:
            vol_bad = True
            add(f"vol_{mount}", "warn", "disk", f"{mount} diskda joy kam: {p:.0f}%", f"Boʻsh joy: {gb(v.get('free'))}",
                "Vaqtinchalik fayllarni tozalang (Boshqaruv → Tozalash).")
    if not vol_bad and snap.get("volumes"):
        free = sum(v.get("free") or 0 for v in snap["volumes"])
        add("volumes", "ok", "disk", "Disklarda joy yetarli", f"Jami boʻsh: {gb(free)}")

    # --- Fizik disklar (SSD/HDD) ---
    phys = {d.get("name"): d for d in (sysinfo.get("physical_disks") or [])}
    for i, d in enumerate(snap.get("disks") or []):
        name = d.get("name") or f"Disk {i + 1}"
        info = phys.get(name) or {}
        media = (info.get("media") or "").upper()
        dt, life = _num(d.get("temp")), _num(d.get("life"))
        hdd = media == "HDD"
        tw, tc = (50, 55) if hdd else (65, 75)
        if life is not None and life < 10:
            add(f"disk_life_{i}", "crit", "disk", f"{name}: resurs {life:.0f}% qoldi", "SSD eskirgan",
                "Muhim maʼlumotlarni zudlik bilan zaxiralang va diskni almashtirishni rejalashtiring.")
        elif life is not None and life < 30:
            add(f"disk_life_{i}", "warn", "disk", f"{name}: resurs {life:.0f}%", "SSD eskirmoqda", "Zaxira nusxa oling.")
        if dt is not None and dt >= tc:
            add(f"disk_temp_{i}", "crit", "disk", f"{name} juda issiq: {dt:.0f}°C", "",
                "SSD radiatorini oʻrnating yoki korpus havo oqimini yaxshilang.")
        elif dt is not None and dt >= tw:
            add(f"disk_temp_{i}", "warn", "disk", f"{name} issiq: {dt:.0f}°C", "", "Havo oqimini tekshiring.")
    for i, d in enumerate(sysinfo.get("physical_disks") or []):
        h = (d.get("health") or "").lower()
        if h and h not in ("healthy", "ok", "0"):
            add(f"disk_health_{i}", "crit", "disk", f"{d.get('name')}: holati “{d.get('health')}”", "",
                "Diskda nosozlik belgisi bor — maʼlumotlarni darhol zaxiralang.")

    # --- PSU kuchlanishlari ---
    rails = []
    for v in snap.get("voltages") or []:
        c = classify_voltage(v.get("name", ""), _num(v.get("value")))
        if c["nominal"] is None:
            continue
        rails.append((v, c))
    bad = [(v, c) for v, c in rails if c["level"] in ("warn", "crit")]
    for v, c in bad:
        if c["nominal"] == 3.0:
            add("cmos", c["level"], "power", f"CMOS batareyasi zaif: {v['value']:.2f} V", "",
                "Ona platadagi CR2032 batareyasini almashtiring (vaqt va BIOS sozlamalari oʻchib ketmasligi uchun).")
        else:
            add(f"volt_{v.get('name')}", c["level"], "power",
                f"{v.get('name')} kuchlanishi meʼyordan chetda: {v['value']:.2f} V ({c['dev']:+.1f}%)",
                f"Meʼyor: {c['nominal']} V ±5%",
                "Agar kompyuter oʻz-oʻzidan oʻchsa/qayta yuklansa — PSU (quvvat bloki)ni tekshirtiring. "
                "Baʼzi platalarda sensor notoʻgʻri koʻrsatishi ham mumkin, BIOS dagi qiymat bilan solishtiring.")
    main = [(v, c) for v, c in rails if c["nominal"] in (12.0, 5.0, 3.3) and c["level"] == "ok"]
    if main and not bad:
        txt = ", ".join(f"{v['name']} {v['value']:.2f} V" for v, c in main[:3])
        add("psu", "ok", "power", "Quvvat bloki kuchlanishi meʼyorida", txt)

    # --- Fanlar ---
    for f in snap.get("fans") or []:
        nm = (f.get("name") or "").lower()
        if "cpu" in nm and f.get("rpm") is not None and f["rpm"] < 100 and (t or 0) >= 55:
            add("cpu_fan", "crit", "fan", "CPU fani aylanmayapti!", f"{f.get('name')}: {f['rpm']:.0f} RPM",
                "Kompyuterni oʻchiring va CPU fanining ulanganini/tiqilib qolmaganini tekshiring.")

    # --- Tizim ---
    up = _num(snap.get("uptime"))
    if up and up > 7 * 86400:
        add("uptime", "info", "system", f"Kompyuter {fmt_uptime(up)}dan beri oʻchirilmagan", "",
            "Vaqti-vaqti bilan qayta ishga tushirish xotira sizishi va yangilanishlar uchun foydali.")
    df = sysinfo.get("defender")
    if isinstance(df, dict) and df.get("rt") is False:
        add("defender", "warn", "security", "Windows Defender real vaqt himoyasi oʻchiq", "",
            "Agar boshqa antivirus boʻlmasa — Windows Security → Virus & threat protection dan yoqing.")
    elif isinstance(df, dict) and (df.get("sig_age_days") or 0) > 7:
        add("defender_sig", "warn", "security", f"Antivirus bazasi {df['sig_age_days']} kundan beri yangilanmagan", "",
            "Windows Update ni ishga tushiring.")
    bat = snap.get("battery")
    if isinstance(bat, dict) and bat.get("percent") is not None and not bat.get("plugged") and bat["percent"] < 15:
        add("battery", "warn", "power", f"Batareya kam: {bat['percent']:.0f}%", "", "Zaryadlovchini ulang.")
    if snap.get("pawnio") is False and snap.get("source") == "lhm":
        add("pawnio", "info", "system", "PawnIO drayveri oʻrnatilmagan",
            "CPU harorati, PSU kuchlanishi va fanlar toʻliq koʻrinmasligi mumkin",
            "Tizim boʻlimidagi “Drayverni oʻrnatish” tugmasini bosing — agent uni oʻzi oʻrnatadi.")
    if snap.get("source") == "basic":
        add("sensors", "info", "system", "Sensorlar cheklangan rejimda",
            "Harorat, kuchlanish va fanlar koʻrinmayapti",
            "Toʻliq maʼlumot uchun agent papkasiga LibreHardwareMonitor ni joylang va agentni administrator sifatida ishga tushiring.")

    score = 100
    for it in items:
        score -= LEVEL_PENALTY.get(it["level"], 0)
    score = max(0, min(100, score))
    has_crit = any(i["level"] == "crit" for i in items)
    has_warn = any(i["level"] == "warn" for i in items)
    if has_crit:
        level, title = "crit", "Muammo bor"
    elif has_warn:
        level, title = "warn", "Eʼtibor bering"
    else:
        level, title = "ok", "Hammasi joyida"

    # qisqa xulosa
    parts = []
    if t is not None:
        parts.append(f"CPU {t:.0f}°C")
    elif load is not None:
        parts.append(f"CPU {load:.0f}%")
    g0 = (snap.get("gpus") or [{}])[0]
    if _num(g0.get("temp")) is not None:
        parts.append(f"GPU {g0['temp']:.0f}°C")
    if rp is not None:
        parts.append(f"RAM {rp:.0f}%")
    lead = {"ok": "Kompyuter barqaror ishlayapti.", "warn": "Kompyuter ishlayapti, lekin eʼtibor talab qiladigan joylar bor.",
            "crit": "Diqqat! Zudlik bilan koʻrib chiqish kerak boʻlgan muammo bor."}[level]
    summary = lead + (" " + ", ".join(parts) + "." if parts else "")

    order = {"crit": 0, "warn": 1, "info": 2, "ok": 3}
    items.sort(key=lambda i: order.get(i["level"], 9))
    return {"score": score, "level": level, "title": title, "summary": summary, "items": items}
