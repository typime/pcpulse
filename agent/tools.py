"""Tizim maʼlumotlari (PowerShell/CIM), tarmoq, avtoyuklanish (startup) ilovalari, tozalash, Wake-on-LAN."""
from __future__ import annotations

import base64
import json
import logging
import os
import re
import socket
import struct
import subprocess
import sys
import time

import psutil

import winapi

log = logging.getLogger("agent.tools")
IS_WIN = sys.platform == "win32"
NO_WINDOW = 0x08000000 if IS_WIN else 0

# ------------------------------------------------------------------ sysinfo

PS_SYSINFO = r"""
$ErrorActionPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$o=[ordered]@{}
$os=Get-CimInstance Win32_OperatingSystem
$o.os=$os.Caption; $o.os_ver=$os.Version; $o.build=$os.BuildNumber
$cs=Get-CimInstance Win32_ComputerSystem
$o.computer=@{manufacturer=$cs.Manufacturer; model=$cs.Model}
$bb=Get-CimInstance Win32_BaseBoard
$o.board=@{manufacturer=$bb.Manufacturer; product=$bb.Product; version=$bb.Version; serial=$bb.SerialNumber}
$bi=Get-CimInstance Win32_BIOS
$bd=$null; if($bi.ReleaseDate){ $bd=$bi.ReleaseDate.ToString('yyyy-MM-dd') }
$o.bios=@{vendor=$bi.Manufacturer; version=$bi.SMBIOSBIOSVersion; date=$bd}
$p=Get-CimInstance Win32_Processor | Select-Object -First 1
$o.cpu=@{name=([string]$p.Name).Trim(); cores=$p.NumberOfCores; threads=$p.NumberOfLogicalProcessors; max_mhz=$p.MaxClockSpeed; socket=$p.SocketDesignation}
$o.gpus=@(Get-CimInstance Win32_VideoController | ForEach-Object { @{name=$_.Name; driver=$_.DriverVersion; vram=$_.AdapterRAM} })
$o.ram_modules=@(Get-CimInstance Win32_PhysicalMemory | ForEach-Object {
  $sp=$_.ConfiguredClockSpeed; if(-not $sp){$sp=$_.Speed}
  @{slot=$_.DeviceLocator; capacity=$_.Capacity; speed=$sp; manufacturer=$_.Manufacturer; part=([string]$_.PartNumber).Trim()} })
$o.physical_disks=@(Get-PhysicalDisk | ForEach-Object { @{name=$_.FriendlyName; media=[string]$_.MediaType; health=[string]$_.HealthStatus; size=$_.Size; bus=[string]$_.BusType} })
try { $d=Get-MpComputerStatus; if($d){ $o.defender=@{enabled=$d.AntivirusEnabled; rt=$d.RealTimeProtectionEnabled; sig_age_days=$d.AntivirusSignatureAge} } } catch {}
$o | ConvertTo-Json -Depth 4 -Compress
"""


def run_powershell(script: str, timeout: int = 60) -> str:
    enc = base64.b64encode(script.encode("utf-16-le")).decode()
    res = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc],
                         capture_output=True, timeout=timeout, creationflags=NO_WINDOW)
    return res.stdout.decode("utf-8", "replace").strip()


def net_info() -> dict:
    info: dict = {}
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))  # paket yuborilmaydi, faqat marshrut aniqlanadi
        ip = s.getsockname()[0]
        s.close()
        info["ip"] = ip
    except OSError:
        ip = None
    try:
        addrs = psutil.net_if_addrs()
        stats = psutil.net_if_stats()
        for iface, lst in addrs.items():
            v4 = [a for a in lst if a.family == socket.AF_INET]
            if ip and not any(a.address == ip for a in v4):
                continue
            if not ip and not v4:
                continue
            mac = next((a.address for a in lst if a.family == psutil.AF_LINK), None)
            a = next(a for a in v4 if (not ip or a.address == ip))
            bc = a.broadcast
            if not bc and a.netmask:
                ipn = struct.unpack("!I", socket.inet_aton(a.address))[0]
                mask = struct.unpack("!I", socket.inet_aton(a.netmask))[0]
                bc = socket.inet_ntoa(struct.pack("!I", ipn | (~mask & 0xFFFFFFFF)))
            info.update({"iface": iface, "mac": mac.replace("-", ":").upper() if mac else None, "broadcast": bc,
                         "netmask": a.netmask, "speed": getattr(stats.get(iface), "speed", None),
                         "wifi": bool(re.search(r"wi-?fi|wlan|wireless|беспровод", iface, re.I))})
            break
    except Exception as e:
        log.debug("net_info: %s", e)
    return info


def collect_sysinfo() -> dict:
    import platform

    si: dict = {}
    if IS_WIN:
        try:
            out = run_powershell(PS_SYSINFO)
            si = json.loads(out) if out else {}
        except Exception as e:
            log.warning("sysinfo (PowerShell) xatosi: %s", e)
    if not si.get("os"):
        si["os"] = f"{platform.system()} {platform.release()}"
        si["os_ver"] = platform.version()
    if not si.get("cpu"):
        si["cpu"] = {"name": platform.processor() or None, "cores": psutil.cpu_count(False), "threads": psutil.cpu_count(True)}
    for k in ("gpus", "ram_modules", "physical_disks"):
        v = si.get(k)
        if isinstance(v, dict):
            si[k] = [v]
        elif v is None:
            si[k] = []
    si["hostname"] = socket.gethostname()
    si["net"] = net_info()
    si["admin"] = winapi.is_admin()
    si["python"] = platform.python_version()
    return si


# ------------------------------------------------------------------ startup (avtoyuklanish)

if IS_WIN:
    import winreg

    APPROVED = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved"
    RUN_LOCATIONS = [
        ("HKCU", winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", APPROVED + r"\Run"),
        ("HKLM", winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run", APPROVED + r"\Run"),
        ("HKLM32", winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run", APPROVED + r"\Run32"),
    ]
    HIVES = {"HKCU": winreg.HKEY_CURRENT_USER, "HKLM": winreg.HKEY_LOCAL_MACHINE, "HKLM32": winreg.HKEY_LOCAL_MACHINE}


def _folder_locations():
    out = []
    ap = os.environ.get("APPDATA")
    pd = os.environ.get("PROGRAMDATA")
    if ap:
        out.append(("UFOLDER", os.path.join(ap, r"Microsoft\Windows\Start Menu\Programs\Startup")))
    if pd:
        out.append(("CFOLDER", os.path.join(pd, r"Microsoft\Windows\Start Menu\Programs\StartUp")))
    return out


def _approved_state(hive, key, name) -> bool:
    try:
        with winreg.OpenKey(hive, key, 0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY) as k:
            val, _ = winreg.QueryValueEx(k, name)
            return not (bytes(val)[0] & 1)
    except OSError:
        return True


def _exe_from_command(cmd: str) -> str | None:
    cmd = os.path.expandvars(cmd.strip())
    m = re.match(r'^"([^"]+)"', cmd) or re.match(r"^(.+?\.exe)\b", cmd, re.I)
    return m.group(1) if m else None


def startup_list() -> list[dict]:
    if not IS_WIN:
        return []
    items = []
    for loc, hive, key, appr in RUN_LOCATIONS:
        try:
            with winreg.OpenKey(hive, key, 0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY) as k:
                i = 0
                while True:
                    try:
                        name, cmd, _ = winreg.EnumValue(k, i)
                    except OSError:
                        break
                    i += 1
                    exe = _exe_from_command(str(cmd))
                    items.append({"id": f"{loc}|{name}", "name": name, "title": winapi.file_description(exe) or name,
                                  "command": str(cmd)[:300], "scope": "user" if loc == "HKCU" else "all",
                                  "enabled": _approved_state(HIVES[loc], appr, name)})
        except OSError:
            continue
    for loc, folder in _folder_locations():
        try:
            for fn in os.listdir(folder):
                if fn.lower() == "desktop.ini":
                    continue
                hive = winreg.HKEY_CURRENT_USER if loc == "UFOLDER" else winreg.HKEY_LOCAL_MACHINE
                items.append({"id": f"{loc}|{fn}", "name": fn, "title": os.path.splitext(fn)[0], "command": os.path.join(folder, fn),
                              "scope": "user" if loc == "UFOLDER" else "all",
                              "enabled": _approved_state(hive, APPROVED + r"\StartupFolder", fn)})
        except OSError:
            continue
    items.sort(key=lambda x: (not x["enabled"], x["title"].lower()))
    return items


def startup_toggle(item_id: str, enabled: bool) -> bool:
    if not IS_WIN:
        return False
    loc, name = item_id.split("|", 1)
    if loc in ("UFOLDER", "CFOLDER"):
        hive = winreg.HKEY_CURRENT_USER if loc == "UFOLDER" else winreg.HKEY_LOCAL_MACHINE
        key = APPROVED + r"\StartupFolder"
    else:
        hive = HIVES[loc]
        key = APPROVED + (r"\Run32" if loc == "HKLM32" else r"\Run")
    if enabled:
        data = b"\x02" + b"\x00" * 11
    else:
        ft = int((time.time() + 11644473600) * 10_000_000)  # FILETIME
        data = b"\x03\x00\x00\x00" + struct.pack("<Q", ft)
    with winreg.CreateKeyEx(hive, key, 0, winreg.KEY_SET_VALUE | winreg.KEY_WOW64_64KEY) as k:
        winreg.SetValueEx(k, name, 0, winreg.REG_BINARY, data)
    return True


# ------------------------------------------------------------------ tozalash

def _temp_dirs() -> list[str]:
    dirs = []
    for d in (os.environ.get("TEMP"), os.environ.get("TMP"), os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "Temp") if IS_WIN else None):
        if d and os.path.isdir(d) and os.path.normcase(os.path.abspath(d)) not in [os.path.normcase(x) for x in dirs]:
            dirs.append(os.path.abspath(d))
    return dirs


def cleanup_scan(min_age_h: float = 24) -> dict:
    cutoff = time.time() - min_age_h * 3600
    total = cleanable = files = 0
    for d in _temp_dirs():
        for root, _, fns in os.walk(d):
            for fn in fns:
                try:
                    st = os.stat(os.path.join(root, fn))
                except OSError:
                    continue
                total += st.st_size
                files += 1
                if st.st_mtime < cutoff:
                    cleanable += st.st_size
    rb_size, rb_items = winapi.recycle_bin_info()
    return {"temp_total": total, "temp_cleanable": cleanable, "temp_files": files, "recycle_bytes": rb_size,
            "recycle_items": rb_items, "dirs": _temp_dirs()}


def cleanup_run(temp: bool = True, recycle: bool = True, min_age_h: float = 24) -> dict:
    if not IS_WIN:
        return {"freed": 0, "deleted": 0, "note": "Faqat Windows da"}
    freed = deleted = 0
    cutoff = time.time() - min_age_h * 3600
    if temp:
        for d in _temp_dirs():
            for root, dirs, fns in os.walk(d, topdown=False):
                for fn in fns:
                    p = os.path.join(root, fn)
                    try:
                        st = os.stat(p)
                        if st.st_mtime < cutoff:
                            os.remove(p)
                            freed += st.st_size
                            deleted += 1
                    except OSError:
                        pass  # ishlatilayotgan fayl — oʻtkazib yuboramiz
                for dn in dirs:
                    try:
                        os.rmdir(os.path.join(root, dn))
                    except OSError:
                        pass
    if recycle:
        size, _ = winapi.recycle_bin_info()
        if size and winapi.empty_recycle_bin():
            freed += size
    return {"freed": freed, "deleted": deleted}


# ------------------------------------------------------------------ WOL

def send_magic_packet(mac: str, broadcast: str | None = None, port: int = 9) -> None:
    raw = bytes.fromhex(re.sub(r"[^0-9A-Fa-f]", "", mac))
    if len(raw) != 6:
        raise ValueError("MAC notoʻgʻri")
    pkt = b"\xff" * 6 + raw * 16
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        for addr in {broadcast or "255.255.255.255", "255.255.255.255"}:
            for p in {port or 9, 9, 7}:
                try:
                    s.sendto(pkt, (addr, p))
                except OSError:
                    pass


def pawnio_installed() -> bool | None:
    """LibreHardwareMonitor 0.9.5+ past darajadagi sensorlar uchun PawnIO drayverini talab qiladi."""
    if not IS_WIN:
        return None
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Services\PawnIO"):
            return True
    except OSError:
        return False
