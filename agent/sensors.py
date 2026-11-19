"""Sensorlar: LibreHardwareMonitor (DLL yoki web-server) + psutil/nvidia-smi zaxira rejimi.

Barcha manbalar bir xil "xom sensor" roʻyxatini beradi:
  {"hw": "Cpu", "hw_name": "AMD Ryzen 7 5800X", "type": "Temperature", "name": "Core (Tctl/Tdie)", "value": 48.2, "id": "/amdcpu/0/temperature/2"}
soʻng `normalize()` uni dashboard tushunadigan koʻrinishga keltiradi.
"""
from __future__ import annotations

import json
import logging
import math
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request

import psutil

log = logging.getLogger("agent.sensors")
IS_WIN = sys.platform == "win32"
NO_WINDOW = 0x08000000 if IS_WIN else 0


def _clean(v):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(v) or math.isinf(v) else v


# --------------------------------------------------------------------------- LHM DLL

class LhmDll:
    name = "lhm"

    def __init__(self, folder: str):
        dll = os.path.join(folder, "LibreHardwareMonitorLib.dll")
        if not os.path.exists(dll):
            raise FileNotFoundError(f"{dll} topilmadi")
        # Internetdan yuklangan DLL lar "blocked" boʻladi — Zone.Identifier ni olib tashlaymiz
        for fn in os.listdir(folder):
            try:
                os.remove(os.path.join(folder, fn) + ":Zone.Identifier")
            except OSError:
                pass
        rc = [f for f in os.listdir(folder) if f.endswith(".runtimeconfig.json")]
        try:
            import pythonnet  # type: ignore

            if rc:
                pythonnet.load("coreclr", runtime_config=os.path.join(folder, rc[0]))
            else:
                pythonnet.load("netfx")
        except Exception as e:  # allaqachon yuklangan boʻlishi mumkin
            log.debug("pythonnet.load: %s", e)
        import clr  # type: ignore

        sys.path.append(folder)
        clr.AddReference(dll)
        from LibreHardwareMonitor.Hardware import Computer  # type: ignore

        c = Computer()
        for flag in ("IsCpuEnabled", "IsGpuEnabled", "IsMemoryEnabled", "IsMotherboardEnabled", "IsControllerEnabled",
                     "IsStorageEnabled", "IsPsuEnabled", "IsBatteryEnabled"):
            try:
                setattr(c, flag, True)
            except Exception:
                pass
        c.Open()
        self.computer = c
        self.controls: dict[str, object] = {}
        self.read()

    def _walk(self, hw, out, parent_type=None, parent_name=None):
        hw.Update()
        htype = str(hw.HardwareType)
        name = str(hw.Name)
        for s in hw.Sensors:
            sid = str(s.Identifier)
            st = str(s.SensorType)
            out.append({"hw": parent_type or htype, "chip": name if parent_name else None, "hw_name": parent_name or name,
                        "type": st, "name": str(s.Name), "value": _clean(s.Value), "id": sid})
            if st == "Control" and s.Control is not None:
                self.controls[sid] = s.Control
        for sub in hw.SubHardware:
            self._walk(sub, out, parent_type or htype, parent_name or name)

    def read(self) -> list[dict]:
        out: list[dict] = []
        for hw in self.computer.Hardware:
            try:
                self._walk(hw, out)
            except Exception as e:
                log.debug("hw update: %s", e)
        return out

    def set_fan(self, control_id: str, pct: float | None) -> bool:
        ctl = self.controls.get(control_id)
        if ctl is None:
            return False
        if pct is None:
            ctl.SetDefault()
        else:
            ctl.SetSoftware(float(max(0, min(100, pct))))
        return True

    def close(self):
        for ctl in self.controls.values():
            try:
                ctl.SetDefault()
            except Exception:
                pass
        try:
            self.computer.Close()
        except Exception:
            pass


# --------------------------------------------------------------------------- LHM web-server (data.json)

GROUP_TYPES = {"voltages": "Voltage", "temperatures": "Temperature", "fans": "Fan", "controls": "Control", "load": "Load",
               "clocks": "Clock", "powers": "Power", "data": "Data", "throughput": "Throughput", "levels": "Level",
               "currents": "Current", "factors": "Factor", "flows": "Flow", "energy": "Energy"}
ICON_HW = {"cpu": "Cpu", "nvidia": "GpuNvidia", "ati": "GpuAmd", "amd": "GpuAmd", "intel": "GpuIntel", "ram": "Memory",
           "mainboard": "Motherboard", "chip": "SuperIO", "hdd": "Storage", "nic": "Network", "battery": "Battery"}


class LhmHttp:
    name = "lhm-http"

    def __init__(self, url: str = "http://127.0.0.1:8085/data.json"):
        self.url = url
        self.read()

    def read(self) -> list[dict]:
        with urllib.request.urlopen(self.url, timeout=2) as r:
            tree = json.loads(r.read().decode("utf-8", "replace"))
        out: list[dict] = []

        def parse_val(s):
            m = re.search(r"-?\d+(?:[.,]\d+)?", str(s or ""))
            return _clean(m.group(0).replace(",", ".")) if m else None

        def walk(node, hw_type=None, hw_name=None, group=None, depth=0):
            text = node.get("Text") or ""
            kids = node.get("Children") or []
            low = text.lower()
            if not kids:
                if depth >= 3 and (group or node.get("SensorId")) and low not in GROUP_TYPES:
                    st = node.get("Type") or GROUP_TYPES.get(group or "", "Other")
                    out.append({"hw": hw_type or "Other", "hw_name": hw_name or "", "type": st, "name": text,
                                "value": parse_val(node.get("Value")),
                                "id": node.get("SensorId") or f"/{hw_name}/{group}/{text}"})
                return
            if low in GROUP_TYPES:
                group = low
            elif depth == 2:  # 0=root, 1=kompyuter, 2=apparat
                icon = (node.get("ImageURL") or "").rsplit("/", 1)[-1].split(".")[0].lower()
                hw_type, hw_name = ICON_HW.get(icon, "Other"), text
            for k in kids:
                walk(k, hw_type, hw_name, group, depth + 1)

        walk(tree)
        return out

    def set_fan(self, control_id, pct):
        return False

    def close(self):
        pass


# --------------------------------------------------------------------------- zaxira: psutil + nvidia-smi

class Basic:
    name = "basic"

    def __init__(self):
        self.nvsmi = shutil.which("nvidia-smi")
        if not self.nvsmi and IS_WIN:
            p = r"C:\Windows\System32\nvidia-smi.exe"
            self.nvsmi = p if os.path.exists(p) else None
        self._nv_cache: tuple[float, list] = (0, [])

    def _nvidia(self) -> list[dict]:
        if not self.nvsmi:
            return []
        if time.time() - self._nv_cache[0] < 3:
            return self._nv_cache[1]
        out = []
        try:
            q = "name,temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw,clocks.gr,clocks.mem,fan.speed"
            res = subprocess.run([self.nvsmi, f"--query-gpu={q}", "--format=csv,noheader,nounits"], capture_output=True,
                                 text=True, timeout=4, creationflags=NO_WINDOW)
            for i, line in enumerate(res.stdout.strip().splitlines()):
                f = [x.strip() for x in line.split(",")]
                if len(f) < 9:
                    continue
                name = f[0]
                base = f"/gpu-nvidia/{i}"
                for t, n, v, sid in (("Temperature", "GPU Core", f[1], "temperature/0"), ("Load", "GPU Core", f[2], "load/0"),
                                     ("SmallData", "GPU Memory Used", f[3], "smalldata/1"), ("SmallData", "GPU Memory Total", f[4], "smalldata/2"),
                                     ("Power", "GPU Package", f[5], "power/0"), ("Clock", "GPU Core", f[6], "clock/0"),
                                     ("Clock", "GPU Memory", f[7], "clock/1"), ("Control", "GPU Fan", f[8], "control/1")):
                    out.append({"hw": "GpuNvidia", "hw_name": name, "type": t, "name": n, "value": _clean(v), "id": f"{base}/{sid}"})
        except Exception as e:
            log.debug("nvidia-smi: %s", e)
        self._nv_cache = (time.time(), out)
        return out

    def read(self) -> list[dict]:
        out = self._nvidia()
        # Linux/Mac: psutil haroratlari (Windows da mavjud emas)
        try:
            temps = psutil.sensors_temperatures() if hasattr(psutil, "sensors_temperatures") else {}
        except Exception:
            temps = {}
        for chip, entries in (temps or {}).items():
            hw = "Cpu" if chip in ("coretemp", "k10temp", "zenpower", "cpu_thermal", "cpu-thermal") else "Motherboard"
            if chip in ("nvme",):
                hw = "Storage"
            for j, e in enumerate(entries):
                label = e.label or chip
                if hw == "Cpu" and chip == "coretemp" and label.startswith("Package"):
                    label = "CPU Package"
                if hw == "Cpu" and chip == "k10temp" and label == "Tctl":
                    label = "Core (Tctl/Tdie)"
                out.append({"hw": hw, "hw_name": chip, "type": "Temperature", "name": label, "value": _clean(e.current),
                            "id": f"/{chip}/temperature/{j}"})
        try:
            fans = psutil.sensors_fans() if hasattr(psutil, "sensors_fans") else {}
        except Exception:
            fans = {}
        for chip, entries in (fans or {}).items():
            for j, e in enumerate(entries):
                out.append({"hw": "SuperIO", "hw_name": chip, "type": "Fan", "name": e.label or f"Fan #{j + 1}",
                            "value": _clean(e.current), "id": f"/lpc/{chip}/fan/{j}"})
        return out

    def set_fan(self, control_id, pct):
        return False

    def close(self):
        pass


def open_source(lhm_folder: str, prefer: str = "auto"):
    errors = []
    if prefer in ("auto", "lhm") and IS_WIN:
        try:
            return LhmDll(lhm_folder), None
        except Exception as e:
            errors.append(f"DLL: {e}")
    if prefer in ("auto", "lhm-http"):
        try:
            return LhmHttp(), None
        except Exception as e:
            errors.append(f"HTTP: {e}")
    return Basic(), "; ".join(errors) or None


# --------------------------------------------------------------------------- normalize

def kind_of(s: dict) -> str:
    hw = (s.get("hw") or "").lower()
    sid = (s.get("id") or "").lower()
    if hw.startswith("gpu") or sid.startswith(("/gpu", "/nvidiagpu", "/atigpu", "/intelgpu")):
        return "gpu"
    if hw == "cpu" or sid.startswith(("/amdcpu", "/intelcpu", "/cpu")):
        return "cpu"
    if hw in ("memory", "ram") or sid.startswith(("/ram", "/memory")):
        return "memory"
    if hw == "storage" or sid.startswith(("/hdd", "/nvme", "/ssd", "/storage", "/ata")):
        return "storage"
    if hw == "psu" or sid.startswith("/psu"):
        return "psu"
    if hw == "battery" or sid.startswith("/battery"):
        return "battery"
    if hw == "network" or sid.startswith("/nic"):
        return "network"
    if hw in ("motherboard", "superio", "embeddedcontroller", "cooler", "controller") or sid.startswith(("/lpc", "/mainboard", "/ec", "/lpcio")):
        return "board"
    return "other"


def _pick(sensors, typ, names, contains=False):
    for want in names:
        for s in sensors:
            if s["type"] != typ or s["value"] is None:
                continue
            n = s["name"].lower()
            if (want in n) if contains else (n == want):
                return s["value"]
    return None


def _num_in(name: str) -> int:
    m = re.search(r"#(\d+)", name)
    return int(m.group(1)) if m else 0


def normalize(raw: list[dict], fan_labels: dict | None = None) -> dict:
    fan_labels = fan_labels or {}
    groups: dict[str, dict[str, list]] = {}
    for s in raw:
        k = kind_of(s)
        groups.setdefault(k, {}).setdefault(s.get("hw_name") or k, []).append(s)

    out: dict = {"cpu": {}, "gpus": [], "disks": [], "mb": {"temps": []}, "voltages": [], "fans": [], "psu": None, "power": {}}

    # CPU
    for hw_name, ss in (groups.get("cpu") or {}).items():
        temp = _pick(ss, "Temperature", ["core (tctl/tdie)", "cpu package", "package", "tctl", "tdie", "core max", "core average", "cpu"])
        if temp is None:
            ts = [s["value"] for s in ss if s["type"] == "Temperature" and s["value"] is not None and "distance" not in s["name"].lower()]
            temp = max(ts) if ts else None
        cores = sorted([s for s in ss if s["type"] == "Load" and s["value"] is not None and re.match(r"cpu core #\d+$", s["name"].lower())],
                       key=lambda s: _num_in(s["name"]))
        if not cores:
            cores = [s for s in ss if s["type"] == "Load" and s["value"] is not None and "thread" in s["name"].lower()]
        clocks = [s["value"] for s in ss if s["type"] == "Clock" and s["value"] and re.search(r"core #\d+", s["name"].lower())]
        out["cpu"] = {
            "name": hw_name if "/" not in hw_name else None,
            "load": _pick(ss, "Load", ["cpu total"]),
            "temp": temp,
            "clock": round(sum(clocks) / len(clocks)) if clocks else None,
            "power": _pick(ss, "Power", ["package", "cpu package"]),
            "cores": [round(s["value"], 1) for s in cores],
            "temps": [{"name": s["name"], "value": round(s["value"], 1)} for s in ss
                      if s["type"] == "Temperature" and s["value"] is not None and "distance" not in s["name"].lower()][:24],
        }
        break

    # GPU
    for hw_name, ss in (groups.get("gpu") or {}).items():
        g = {
            "name": hw_name,
            "load": _pick(ss, "Load", ["gpu core", "d3d 3d", "gpu"]),
            "temp": _pick(ss, "Temperature", ["gpu core", "gpu", "gpu temperature"]),
            "hotspot": _pick(ss, "Temperature", ["gpu hot spot", "hot spot"]),
            "mem_temp": _pick(ss, "Temperature", ["gpu memory junction", "gpu memory"]),
            "mem_used": _pick(ss, "SmallData", ["gpu memory used", "d3d dedicated memory used"]),
            "mem_total": _pick(ss, "SmallData", ["gpu memory total"]),
            "power": _pick(ss, "Power", ["gpu package", "gpu power", "gpu core"]),
            "clock": _pick(ss, "Clock", ["gpu core"]),
            "mem_clock": _pick(ss, "Clock", ["gpu memory"]),
            "fan_rpm": _pick(ss, "Fan", ["gpu fan", "gpu fan 1", "fan"], contains=True),
            "fan_pct": _pick(ss, "Control", ["gpu fan", "fan"], contains=True),
        }
        if g["load"] is None and g["temp"] is None:
            continue
        hn = hw_name.lower()
        g["vendor"] = "nvidia" if "nvidia" in hn or "geforce" in hn or "rtx" in hn else "amd" if "radeon" in hn or "amd" in hn else "intel" if "intel" in hn else ""
        out["gpus"].append(g)
    # diskret GPU birinchi boʻlsin
    out["gpus"].sort(key=lambda g: (g["vendor"] == "intel", -(g["mem_total"] or 0)))

    # Storage
    for hw_name, ss in (groups.get("storage") or {}).items():
        life = _pick(ss, "Level", ["remaining life"])
        used = _pick(ss, "Level", ["percentage used"])
        if life is None and used is not None:
            life = max(0.0, 100 - used)
        out["disks"].append({
            "name": hw_name,
            "temp": _pick(ss, "Temperature", ["temperature", "composite temperature", "temperature 1"], contains=False)
            or _pick(ss, "Temperature", ["temp"], contains=True),
            "life": life,
            "written_gb": _pick(ss, "Data", ["data written", "total bytes written"]),
            "read_gb": _pick(ss, "Data", ["data read"]),
            "used_pct": _pick(ss, "Load", ["used space"]),
            "read_bps": _pick(ss, "Throughput", ["read rate"]),
            "write_bps": _pick(ss, "Throughput", ["write rate"]),
        })

    # Motherboard / SuperIO
    board = groups.get("board") or {}
    controls, fans = {}, {}
    for hw_name, ss in board.items():
        for s in ss:
            v = s["value"]
            if s["type"] == "Temperature" and v is not None and 0 < v < 125:
                out["mb"]["temps"].append({"name": s["name"], "value": round(v, 1), "id": s["id"]})
            elif s["type"] == "Voltage" and v is not None and v > 0:
                out["voltages"].append({"id": s["id"], "name": s["name"], "value": round(v, 3)})
            elif s["type"] == "Fan":
                fans[s["id"]] = s
            elif s["type"] == "Control":
                controls[s["id"]] = s
    names = [n for n, ss in board.items() if any((s.get("hw") or "").lower() == "motherboard" for s in ss)]
    out["mb"]["name"] = names[0] if names else None
    chips = sorted({s.get("chip") for ss in board.values() for s in ss if s.get("chip")})
    out["mb"]["chip"] = ", ".join(chips) or None

    # GPU fan/control larni ham boshqarish roʻyxatiga qoʻshamiz
    for hw_name, ss in (groups.get("gpu") or {}).items():
        for s in ss:
            if s["type"] == "Fan":
                fans[s["id"]] = s
            elif s["type"] == "Control" and "fan" in s["name"].lower():
                controls[s["id"]] = s

    used_fans = set()
    for cid, c in controls.items():
        fid = cid.replace("/control/", "/fan/")
        f = fans.get(fid)
        if f:
            used_fans.add(fid)
        name = fan_labels.get(cid) or (f["name"] if f else c["name"])
        out["fans"].append({"id": fid if f else cid, "control_id": cid, "name": name, "raw_name": f["name"] if f else c["name"],
                            "rpm": f["value"] if f else None, "pct": c["value"], "hw": kind_of(c),
                            "hw_name": c.get("hw_name")})
    for fid, f in fans.items():
        if fid in used_fans:
            continue
        out["fans"].append({"id": fid, "control_id": None, "name": fan_labels.get(fid) or f["name"], "raw_name": f["name"],
                            "rpm": f["value"], "pct": None, "hw": kind_of(f), "hw_name": f.get("hw_name")})
    out["fans"].sort(key=lambda f: (f["hw"] == "gpu", not (f["rpm"] or 0) > 0, f["id"]))

    # Raqamli PSU (Corsair HXi/RMi/AXi va h.k.)
    for hw_name, ss in (groups.get("psu") or {}).items():
        out["psu"] = {
            "name": hw_name,
            "power": _pick(ss, "Power", ["total output", "power total", "total watts", "total"], contains=True),
            "temp": _pick(ss, "Temperature", ["vrm", "case", "temperature"], contains=True),
            "fan_rpm": _pick(ss, "Fan", ["fan"], contains=True),
        }
        for s in ss:
            if s["type"] == "Voltage" and s["value"]:
                out["voltages"].append({"id": s["id"], "name": s["name"], "value": round(s["value"], 3), "src": "psu"})
        break

    # Quvvat
    cpu_p = out["cpu"].get("power")
    gpu_p = sum(g["power"] for g in out["gpus"] if g.get("power")) or None
    est = None
    if out["psu"] and out["psu"].get("power"):
        est = out["psu"]["power"]
    elif cpu_p or gpu_p:
        est = (cpu_p or 0) + (gpu_p or 0) + 35  # ona plata, RAM, disklar, fanlar ≈ 35 W
    out["power"] = {"cpu": cpu_p, "gpu": gpu_p, "psu": (out["psu"] or {}).get("power"), "est": round(est) if est else None}
    return out
