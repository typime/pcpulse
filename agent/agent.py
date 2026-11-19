"""PC Pulse agent — kompyuterda fon rejimida ishlaydi, maʼlumotni bulutga yuboradi va buyruqlarni bajaradi.

PCPulseAgent.exe birinchi ishga tushganda kirish oynasini koʻrsatadi, soʻng oʻzini
Windows bilan birga (administrator huquqi bilan, oynasiz) ishga tushadigan qilib oʻrnatadi.
Manbadan:  python agent.py            (birinchi marta kirish oynasi chiqadi)
           python agent.py --selftest natija.json
"""
from __future__ import annotations

import argparse
import base64
import getpass
import io
import json
import logging
import logging.handlers
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

import psutil

import cloud
import health
import sensors
import tools
import updater
import winapi

try:
    from build_info import VERSION  # CI yigʻishda yaratadi: 2.2.<build raqami>
except ImportError:
    VERSION = "2.2.0"
IS_WIN = sys.platform == "win32"
NO_WINDOW = 0x08000000 if IS_WIN else 0
FROZEN = bool(getattr(sys, "frozen", False))
BASE = os.path.dirname(os.path.abspath(sys.executable if FROZEN else __file__))
RES_DIR = getattr(sys, "_MEIPASS", BASE)
if IS_WIN:
    DATA_DIR = os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "PCPulse")
else:
    DATA_DIR = os.path.join(os.path.expanduser("~"), ".pcpulse")
os.makedirs(DATA_DIR, exist_ok=True)
CONFIG_PATH = os.path.join(DATA_DIR, "config.json")
USAGE_PATH = os.path.join(DATA_DIR, "usage.json")
STOP_FLAG = os.path.join(DATA_DIR, "stop.flag")
INSTALLED_EXE = os.path.join(DATA_DIR, "PCPulseAgent.exe")
PREV_EXE = os.path.join(DATA_DIR, "PCPulseAgent.prev.exe")  # yangilanishdan oldingi nusxa (orqaga qaytarish uchun)
UPDATE_DIR = os.path.join(DATA_DIR, "update")
VERSION_FILE = os.path.join(DATA_DIR, "version.json")  # ishlab turgan agent versiyasi va pid
UPDATE_STATE = os.path.join(DATA_DIR, "update_state.json")
UA = f"PCPulseAgent/{VERSION}"
TASK_NAME = "PC Pulse Agent"
LHM_DIR = next((d for d in (os.path.join(RES_DIR, "lhm"), os.path.join(BASE, "lhm"))
                if os.path.exists(os.path.join(d, "LibreHardwareMonitorLib.dll"))), os.path.join(RES_DIR, "lhm"))
LOCK_PORT = 47651

log = logging.getLogger("agent")

PROTECTED = {
    "system", "registry", "smss.exe", "csrss.exe", "wininit.exe", "winlogon.exe", "services.exe", "lsass.exe", "lsaiso.exe",
    "svchost.exe", "dwm.exe", "fontdrvhost.exe", "memory compression", "msmpeng.exe", "securityhealthservice.exe",
    "logonui.exe", "lockapp.exe", "sihost.exe", "ctfmon.exe", "wudfhost.exe", "spoolsv.exe", "system idle process",
    "systemd", "init", "kthreadd",
}
FAN_PRESETS = {
    "silent": [[30, 20], [50, 30], [65, 45], [75, 70], [85, 100]],
    "balanced": [[30, 30], [50, 40], [65, 60], [75, 80], [85, 100]],
    "performance": [[30, 45], [50, 60], [65, 80], [75, 100]],
    "max": [[0, 100]],
}
POWER_NAMES = {"lock": "qulflash", "sleep": "uyqu rejimi", "hibernate": "gibernatsiya", "shutdown": "oʻchirish", "restart": "qayta yoqish"}


class AuthError(Exception):
    pass


class RpcError(Exception):
    pass


def rpc(fn: str, params: dict, timeout: float = 20):
    """Supabase RPC chaqiruvi (PostgREST)."""
    data = json.dumps(params, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(f"{cloud.SUPABASE_URL}/rest/v1/rpc/{fn}", data=data, method="POST", headers={
        "apikey": cloud.SUPABASE_KEY, "Content-Type": "application/json", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            res = json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        try:
            j = json.loads(body)
        except Exception:
            j = {}
        if j.get("code") == "28000":
            raise AuthError(j.get("message") or "token yaroqsiz") from e
        raise RpcError(j.get("message") or f"HTTP {e.code}: {body[:200]}") from e
    if isinstance(res, dict) and set(res) == {"error"}:
        raise RpcError(res["error"])
    return res


def today() -> str:
    return time.strftime("%Y-%m-%d")


def hhmm(ts: float | None = None) -> str:
    return time.strftime("%H:%M", time.localtime(ts or time.time()))


def pretty_exe(name: str) -> str:
    base = name[:-4] if name.lower().endswith(".exe") else name
    return base[:1].upper() + base[1:]


def interp(curve: list, t: float) -> float:
    pts = sorted((float(a), float(b)) for a, b in curve)
    if not pts:
        return 60.0
    if t <= pts[0][0]:
        return pts[0][1]
    for (t1, p1), (t2, p2) in zip(pts, pts[1:]):
        if t <= t2:
            return p1 + (p2 - p1) * (t - t1) / max(1e-6, (t2 - t1))
    return pts[-1][1]


# --------------------------------------------------------------------------- ilova vaqti

class UsageStore:
    """{kun: {ilova: [nomi, soniya]}} — mahalliy faylda ham saqlanadi (server oflayn boʻlsa ham yoʻqolmaydi)."""

    def __init__(self, path: str):
        self.path = path
        self.lock = threading.Lock()
        self.data: dict[str, dict[str, list]] = {}
        try:
            with open(path, encoding="utf-8") as f:
                self.data = json.load(f)
        except Exception:
            self.data = {}
        self.dirty = set(self.data)  # ishga tushganda hammasini sinxronlaymiz (server MAX oladi)
        self.last_save = time.time()

    def add(self, day: str, app: str, name: str, sec: float) -> None:
        with self.lock:
            d = self.data.setdefault(day, {})
            cur = d.get(app)
            d[app] = [name, (cur[1] if cur else 0) + sec]
            self.dirty.add(day)

    def payload(self) -> dict:
        with self.lock:
            return {day: {a: [v[0], int(v[1])] for a, v in self.data.get(day, {}).items()} for day in self.dirty}

    def mark_synced(self, days) -> None:
        with self.lock:
            self.dirty -= set(days)

    def today_summary(self, day: str) -> dict:
        with self.lock:
            apps = self.data.get(day, {})
            top = sorted(apps.items(), key=lambda kv: -kv[1][1])[:5]
            return {"total": int(sum(v[1] for v in apps.values())), "top": [{"app": a, "name": v[0], "sec": int(v[1])} for a, v in top]}

    def save(self) -> None:
        with self.lock:
            keep = sorted(self.data)[-120:]  # mahalliy nusxa: oxirgi 120 kun
            self.data = {k: self.data[k] for k in keep}
            tmp = self.path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False)
            os.replace(tmp, self.path)
            self.last_save = time.time()


# --------------------------------------------------------------------------- agent

class Agent:
    def __init__(self, cfg: dict, lock_sock=None):
        self.cfg = cfg
        self.lock_sock = lock_sock
        self.server = cloud.SUPABASE_URL
        self.token = cfg["token"]
        self.settings: dict = cfg.get("settings") or {}
        self.settings_ver = cfg.get("settings_ver", 0)
        self.running = True
        self.lock = threading.Lock()
        self.latest: dict = {}
        self.raw_sensors: list = []
        self.source = None
        self.lhm_error = None
        self.interval = 10
        self.wake = threading.Event()
        self.usage = UsageStore(USAGE_PATH)
        self.last_usage_sync = 0.0
        self.sysinfo: dict | None = None
        self.sysinfo_pending = False
        self.idle = 0.0
        self.locked = False
        self.seen_locked = False
        self.fg_public = None
        self.fg_fullscreen = False
        self.proc_names: set[str] = set()
        self.procs_cache: dict = {}
        self.pid_cache: dict[int, tuple[str, str | None]] = {}
        self.guard = {"state": "off"}
        self.suppress_until = 0.0
        self.timer: dict | None = None
        self.idle_done: set[str] = set()
        self.fan_state: dict[str, dict] = {}
        self.ping_ms = None
        self.alerts: dict = cfg.get("alerts") or {}
        self.pawnio = tools.pawnio_installed()
        self._io = None
        self._net = None
        self._vol_cache: tuple[float, list] = (0, [])
        self.upd: dict = {"state": "idle"}
        self.upd_lock = threading.Lock()
        self.upd_wake = threading.Event()
        try:
            import PIL.ImageGrab  # noqa: F401
            self.has_pil = True
        except Exception:
            self.has_pil = False

    # ------------------------------------------------------------- bulut
    def rpc(self, fn: str, params: dict | None = None, timeout: float = 20):
        return rpc(fn, {"p_token": self.token, **(params or {})}, timeout=timeout)

    def post_event(self, level: str, title: str, body: str = "", push: bool = True, tag: str | None = None):
        def go():
            for _ in range(5):
                try:
                    self.rpc("pp_agent_event", {"p_level": level, "p_title": title, "p_body": body, "p_push": push, "p_tag": tag})
                    return
                except Exception as e:
                    log.debug("event yuborilmadi: %s", e)
                    time.sleep(5)
        log.info("hodisa: %s — %s", title, body)
        threading.Thread(target=go, daemon=True).start()

    # ------------------------------------------------------------- sozlamalar
    def apply_settings(self, settings: dict, ver: int):
        if (settings or {}).get("auto_update", True) and not self.settings.get("auto_update", True):
            self.upd_wake.set()  # avtomatik yangilash yoqildi — darhol tekshiramiz
        self.settings = settings or {}
        self.settings_ver = ver
        self.cfg["settings"], self.cfg["settings_ver"] = self.settings, ver
        save_config(self.cfg)
        log.info("sozlamalar yangilandi (v%s)", ver)

    def s(self, key, default):
        v = self.settings.get(key, default)
        return default if v is None else v

    # ------------------------------------------------------------- sensorlar va snapshot
    def ensure_pawnio(self):
        """Harorat/kuchlanish/fan sensorlari uchun PawnIO kerak — yoʻq boʻlsa, sensorlar ochilishidan oldin oʻrnatamiz."""
        if not (IS_WIN and self.pawnio is False and tools.pawnio_installer() and winapi.is_admin()):
            return
        if self.cfg.get("pawnio_auto") is False:
            return
        log.info("PawnIO oʻrnatilmoqda...")
        ok, msg = tools.install_pawnio()
        self.pawnio = tools.pawnio_installed()
        if ok:
            log.info("PawnIO oʻrnatildi")
            self.post_event("ok", "Harorat sensorlari yoqildi", "PawnIO drayveri oʻrnatildi — CPU harorati, kuchlanish va fanlar endi koʻrinadi", push=False)
        else:
            log.warning("PawnIO oʻrnatilmadi: %s", msg)

    def _shutdown(self):
        """Fayllarni saqlab, fanlarni BIOS ga qaytarib, qulfni boʻshatadi (jarayondan chiqishdan oldin)."""
        self.running = False
        try:
            self.usage.save()
        except Exception:
            pass
        try:
            if self.source:
                self.source.close()
        except Exception:
            pass
        if self.lock_sock:
            try:
                self.lock_sock.close()
            except Exception:
                pass

    def restart(self):
        """Agentni qayta ishga tushirish (yangi drayver/kutubxonani toza yuklash uchun)."""
        log.info("agent qayta ishga tushirilmoqda")
        self._shutdown()
        args = [sys.executable] if FROZEN else [sys.executable, os.path.abspath(__file__)]
        flags = 0x00000008 | 0x00000200 if IS_WIN else 0
        subprocess.Popen(args + ["--restarted"], creationflags=flags, close_fds=True)
        os._exit(0)

    # ------------------------------------------------------------- avtomatik yangilanish
    def update_public(self) -> dict:
        u = self.upd
        return {k: u.get(k) for k in ("state", "latest", "available", "progress", "error", "checked")} | {"auto": bool(self.s("auto_update", True))}

    def check_update(self) -> dict:
        info = updater.fetch_latest(UA)
        self.upd.update(latest=info["version"], available=updater.newer(info["version"], VERSION), checked=time.time(), error=None)
        return info

    def do_update(self, info: dict, reason: str) -> None:
        if not self.upd_lock.acquire(blocking=False):
            return
        try:
            log.info("yangilanish (%s): %s → %s", reason, VERSION, info["version"])
            self.upd.update(state="downloading", progress=0, error=None)
            self.wake.set()

            def prog(got, total):
                self.upd["progress"] = round(got * 100 / max(1, total))

            path = updater.download(info, UPDATE_DIR, UA, progress=prog)
            self.upd.update(state="installing", progress=100)
            self.wake.set()
            time.sleep(2)  # saytga “oʻrnatilmoqda” holati yetib borsin
            write_json(UPDATE_STATE, {"from": VERSION, "to": info["version"], "ts": time.time(), "reason": reason, "pending": True})
            flags = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
            subprocess.Popen([path, "--apply-update"], creationflags=flags, close_fds=True, cwd=UPDATE_DIR)
            log.info("yangilovchi ishga tushdi — agent yopilmoqda")
            self._shutdown()
            os._exit(0)
        except Exception as e:
            log.warning("yangilab boʻlmadi: %s", e)
            self.upd.update(state="error", error=str(e)[:200])
            self.post_event("warn", "Agent yangilanmadi", str(e)[:200], push=False)
            self.wake.set()
        finally:
            if self.upd_lock.locked():
                self.upd_lock.release()

    def report_update_result(self) -> None:
        st = read_json(UPDATE_STATE)
        if not st or st.get("reported") or st.get("pending") and st.get("to") != VERSION:
            return
        if st.get("ok") and st.get("to") == VERSION:
            self.post_event("ok", "Agent yangilandi", f"{st.get('from') or 'eski versiya'} → {VERSION}", push=False)
        elif st.get("ok") is False:
            self.post_event("warn", "Yangilanish bekor qilindi", st.get("error") or "", push=False)
            self.upd.update(state="error", error=st.get("error"))
        else:
            return
        st["reported"] = True
        write_json(UPDATE_STATE, st)

    def update_loop(self):
        if not (IS_WIN and FROZEN):
            return
        self.report_update_result()
        for _ in range(90):  # ishga tushgandan keyin biroz kutamiz
            if not self.running:
                return
            time.sleep(1)
        updater.cleanup(UPDATE_DIR)
        while self.running:
            try:
                info = self.check_update()
                bad = read_json(UPDATE_STATE).get("bad")
                if self.upd.get("available") and self.s("auto_update", True) and info["version"] != bad:
                    self.do_update(info, "auto")
                elif self.upd.get("state") == "error" and not self.upd.get("available"):
                    self.upd["state"] = "idle"
            except Exception as e:
                self.upd["error"] = f"Tekshirib boʻlmadi: {e}"[:200]
                log.info("yangilanish tekshiruvi: %s", e)
            self.upd_wake.wait(6 * 3600 if not self.upd.get("error") else 3600)
            self.upd_wake.clear()

    def collector_loop(self):
        self.ensure_pawnio()
        self.source, self.lhm_error = sensors.open_source(LHM_DIR, self.cfg.get("sensor_source", "auto"))
        log.info("sensor manbasi: %s%s", self.source.name, f" ({self.lhm_error})" if self.lhm_error else "")
        psutil.cpu_percent(None)
        psutil.cpu_percent(None, percpu=True)
        tick, fails, retry_at = 0, 0, time.time() + 300
        while self.running:
            t0 = time.time()
            try:
                try:
                    raw = self.source.read()
                    fails = 0
                except Exception as e:
                    fails += 1
                    raw = []
                    if fails >= 3 and self.source.name != "basic":
                        log.warning("%s ishlamay qoldi (%s) — zaxira rejimga oʻtildi", self.source.name, e)
                        self.lhm_error = str(e)
                        self.source = sensors.Basic()
                if self.source.name == "basic" and time.time() > retry_at and self.cfg.get("sensor_source", "auto") != "basic":
                    retry_at = time.time() + 300
                    try:
                        src = sensors.LhmHttp()
                        self.source, self.lhm_error = src, None
                        log.info("LibreHardwareMonitor web-server topildi")
                    except Exception:
                        pass
                labels = {k: v.get("label") for k, v in (self.s("fans", {}) or {}).items() if isinstance(v, dict) and v.get("label")}
                norm = sensors.normalize(raw, labels)
                snap = self.build_snapshot(norm, tick)
                self.apply_fans(snap)
                with self.lock:
                    self.raw_sensors = raw
                    self.latest = snap
            except Exception:
                log.exception("collector xatosi")
            tick += 1
            period = 2.0 if self.interval <= 2 else 5.0
            time.sleep(max(0.3, period - (time.time() - t0)))

    def build_snapshot(self, norm: dict, tick: int) -> dict:
        now = time.time()
        cpu = norm.get("cpu") or {}
        if cpu.get("load") is None:
            cpu["load"] = psutil.cpu_percent(None)
        per = psutil.cpu_percent(None, percpu=True)
        if not cpu.get("cores"):
            cpu["cores"] = per
        if not cpu.get("name"):
            cpu["name"] = ((self.sysinfo or {}).get("cpu") or {}).get("name")
        if cpu.get("clock") is None:
            try:
                f = psutil.cpu_freq()
                cpu["clock"] = round(f.current) if f else None
            except Exception:
                pass
        cpu["threads"], cpu["phys"] = psutil.cpu_count(), psutil.cpu_count(False)

        vm, sw = psutil.virtual_memory(), psutil.swap_memory()
        ram = {"total": vm.total, "used": vm.total - vm.available, "avail": vm.available, "percent": vm.percent,
               "swap_total": sw.total, "swap_used": sw.used}

        if now - self._vol_cache[0] > 30:
            vols = []
            for p in psutil.disk_partitions(all=False):
                if "cdrom" in p.opts or not p.fstype or p.fstype in ("squashfs", "tmpfs", "overlay", "devtmpfs"):
                    continue
                if not IS_WIN and (p.mountpoint.startswith(("/snap", "/boot", "/var/lib", "/etc", "/proc", "/sys")) or p.mountpoint.count("/") > 2):
                    continue
                try:
                    u = psutil.disk_usage(p.mountpoint)
                except Exception:
                    continue
                vols.append({"mount": p.mountpoint, "fs": p.fstype, "total": u.total, "used": u.used, "free": u.free, "percent": u.percent})
            self._vol_cache = (now, vols[:12])

        io_c, net_c = psutil.disk_io_counters(), psutil.net_io_counters()
        io = net = {}
        if self._io and io_c:
            dt = max(0.1, now - self._io[0])
            io = {"read_bps": max(0, (io_c.read_bytes - self._io[1].read_bytes) / dt), "write_bps": max(0, (io_c.write_bytes - self._io[1].write_bytes) / dt)}
        if self._net and net_c:
            dt = max(0.1, now - self._net[0])
            net = {"down_bps": max(0, (net_c.bytes_recv - self._net[1].bytes_recv) / dt), "up_bps": max(0, (net_c.bytes_sent - self._net[1].bytes_sent) / dt)}
        self._io, self._net = (now, io_c) if io_c else None, (now, net_c) if net_c else None
        ni = (self.sysinfo or {}).get("net") or {}
        net.update({"ip": ni.get("ip"), "iface": ni.get("iface"), "ping_ms": self.ping_ms, "wifi": ni.get("wifi")})

        bat = None
        try:
            b = psutil.sensors_battery()
            if b:
                bat = {"percent": round(b.percent), "plugged": b.power_plugged,
                       "secs_left": b.secsleft if isinstance(b.secsleft, int) and b.secsleft > 0 else None}
        except Exception:
            pass

        if tick % 2 == 0 or not self.procs_cache:
            self.procs_cache = self.collect_procs()

        boot = psutil.boot_time()
        return {
            "v": 1, "host": socket.gethostname(), "uptime": int(now - boot), "boot": int(boot),
            "source": self.source.name if self.source else "basic", "lhm_error": self.lhm_error,
            "cpu": cpu, "gpus": norm.get("gpus") or [], "ram": ram, "disks": norm.get("disks") or [],
            "volumes": self._vol_cache[1], "io": io, "net": net, "mb": norm.get("mb") or {}, "voltages": norm.get("voltages") or [],
            "fans": norm.get("fans") or [], "power": norm.get("power") or {}, "psu": norm.get("psu"), "battery": bat,
            "procs": self.procs_cache, "pawnio": self.pawnio,
        }

    def collect_procs(self, top_mem: int = 15, top_cpu: int = 10, with_pids: bool = False) -> dict:
        ncpu = psutil.cpu_count() or 1
        groups: dict[str, dict] = {}
        names, total, me = set(), 0, os.getpid()
        for p in psutil.process_iter(["pid", "name", "memory_info", "exe"]):
            info = p.info
            pid = info["pid"]
            if pid == 0:
                continue
            name = info.get("name") or "?"
            low = name.lower()
            names.add(low)
            total += 1
            try:
                cpu = p.cpu_percent(None) / ncpu
            except Exception:
                cpu = 0.0
            mi = info.get("memory_info")
            mem = mi.rss if mi else 0
            g = groups.get(low)
            if g is None:
                g = groups[low] = {"name": name, "exe": info.get("exe"), "n": 0, "mem": 0, "cpu": 0.0, "pids": []}
            g["n"] += 1
            g["mem"] += mem
            g["cpu"] += cpu
            if pid == me:
                g["self"] = True
            if len(g["pids"]) < 64:
                g["pids"].append(pid)
            if not g["exe"] and info.get("exe"):
                g["exe"] = info["exe"]
        self.proc_names = names
        out = []
        for low, g in groups.items():
            g["title"] = winapi.file_description(g.get("exe")) or pretty_exe(g["name"])
            g["cpu"] = round(g["cpu"], 1)
            g["protected"] = low in PROTECTED or bool(g.get("self"))
            g.pop("exe", None)
            g.pop("self", None)
            if not with_pids:
                g.pop("pids", None)
            out.append(g)
        by_mem = sorted(out, key=lambda g: -g["mem"])[:top_mem]
        by_cpu = [g for g in sorted(out, key=lambda g: -g["cpu"]) if g["cpu"] >= 0.1][:top_cpu]
        return {"count": total, "groups": len(groups), "by_mem": by_mem, "by_cpu": by_cpu}

    # ------------------------------------------------------------- fanlar
    def apply_fans(self, snap: dict):
        if not self.source or self.source.name != "lhm":
            for f in snap.get("fans", []):
                f["mode"] = "auto"
            return
        rules = self.s("fans", {}) or {}
        minp = max(0, min(60, float(self.s("fan_min_pct", 20))))
        cpu_t = (snap.get("cpu") or {}).get("temp")
        gpu_t = ((snap.get("gpus") or [{}])[0]).get("temp")
        now = time.time()
        for f in snap.get("fans", []):
            cid = f.get("control_id")
            if not cid:
                continue
            r = rules.get(cid) if isinstance(rules.get(cid), dict) else {}
            mode = r.get("mode", "auto")
            st = self.fan_state.setdefault(cid, {"applied": None, "t": 0})
            f["mode"] = mode
            if mode not in ("manual", "curve"):
                if st["applied"] is not None:
                    self.source.set_fan(cid, None)
                    st["applied"] = None
                continue
            if mode == "manual":
                target = float(r.get("value", 50))
            else:
                src = r.get("source") or ("gpu" if f.get("hw") == "gpu" else "cpu")
                temps = [x for x in ((cpu_t,) if src == "cpu" else (gpu_t,) if src == "gpu" else (cpu_t, gpu_t)) if x is not None]
                temp = max(temps) if temps else None
                curve = r.get("curve") if r.get("preset") == "custom" and r.get("curve") else FAN_PRESETS.get(r.get("preset") or "balanced", FAN_PRESETS["balanced"])
                target = interp(curve, temp) if temp is not None else 60.0
                prev = st["applied"] if st["applied"] is not None else (f.get("pct") or target)
                if target < prev:
                    target = max(target, prev - 3)  # pasaytirish sekin — shovqin “sakramasin”
            target = max(minp, min(100.0, target))
            if (f.get("hw") == "gpu" and (gpu_t or 0) >= 88) or (f.get("hw") != "gpu" and (cpu_t or 0) >= 90):
                target = 100.0  # xavfsizlik
            if st["applied"] is None or abs(target - st["applied"]) >= 1 or now - st["t"] > 30:
                try:
                    self.source.set_fan(cid, target)
                    st["applied"], st["t"] = target, now
                except Exception as e:
                    log.warning("fan %s: %s", cid, e)
            f["target"] = round(target)

    # ------------------------------------------------------------- faollik kuzatuvi
    def proc_of(self, pid: int) -> tuple[str, str | None]:
        c = self.pid_cache.get(pid)
        if c:
            return c
        try:
            p = psutil.Process(pid)
            name = p.name()
            try:
                exe = p.exe()
            except Exception:
                exe = None
        except Exception:
            name, exe = "?", None
        if len(self.pid_cache) > 800:
            self.pid_cache.clear()
        self.pid_cache[pid] = (name, exe)
        return name, exe

    def tracker_loop(self):
        last = time.time()
        while self.running:
            time.sleep(1)
            now = time.time()
            dt = min(now - last, 5.0)
            last = now
            if not IS_WIN:
                continue
            try:
                fg = winapi.foreground()
                self.idle = winapi.idle_seconds()
                info = None
                if fg is None:
                    locked = "logonui.exe" in {(p.info["name"] or "").lower() for p in psutil.process_iter(["name"])}
                else:
                    name, exe = self.proc_of(fg["pid"])
                    low = name.lower()
                    locked = low in ("lockapp.exe", "logonui.exe")
                    if not locked:
                        if fg["cls"] in ("Progman", "WorkerW"):
                            info = ("desktop", "Ish stoli")
                        elif low not in ("?", "shellexperiencehost.exe", "searchhost.exe", "startmenuexperiencehost.exe"):
                            info = (low, winapi.file_description(exe) or pretty_exe(name))
                self.locked = locked
                if locked:
                    self.seen_locked = True
                self.fg_fullscreen = bool(fg and winapi.is_fullscreen(fg["hwnd"]))
                self.fg_public = {"app": info[0], "name": info[1], "fullscreen": self.fg_fullscreen} if info else None
                threshold = float(self.s("idle_threshold_sec", 180))
                if info and (self.idle < threshold or self.fg_fullscreen):
                    self.usage.add(today(), info[0], info[1], dt)
                if now - self.usage.last_save > 60:
                    self.usage.save()
            except Exception:
                log.exception("tracker xatosi")

    # ------------------------------------------------------------- qoʻriqlash, harakatsizlik, taymer
    def guard_public(self) -> dict:
        g = self.guard
        return {"state": g["state"], "since": g.get("since"), "grace_until": g.get("grace_until"), "triggered_at": g.get("triggered_at")}

    def guard_loop(self):
        while self.running:
            time.sleep(0.25)
            if not IS_WIN:
                continue
            try:
                now = time.time()
                tick = winapi.last_input_tick()
                g = self.guard
                if g["state"] == "arming" and now >= g["grace_until"]:
                    g.update(state="armed", baseline=tick)
                elif g["state"] == "armed":
                    if now < self.suppress_until:
                        g["baseline"] = tick
                    elif tick is not None and tick != g["baseline"]:
                        winapi.lock_workstation()
                        g.update(state="watch", triggered_at=now, baseline=tick, last_alert=now, triggered=True)
                        self.seen_locked = False
                        self.post_event("crit", "⚠️ Kimdir kompyuterga tegdi",
                                        f"Sichqoncha yoki klaviatura ishlatildi — ekran qulflandi ({hhmm(now)})", tag="guard")
                        self.wake.set()
                elif g["state"] == "watch":
                    if now - g["triggered_at"] > 4 and self.seen_locked and not self.locked:
                        self.guard = {"state": "off"}
                        self.post_event("warn", "🔓 Kompyuter qulfdan chiqarildi",
                                        f"{hhmm(now)} da parol kiritildi. Qoʻriqlash rejimi oʻchdi.", tag="guard")
                        self.wake.set()
                    elif tick is not None and tick != g["baseline"]:
                        g["baseline"] = tick
                        if now - g["last_alert"] > 120 and now - g["triggered_at"] > 5:
                            g["last_alert"] = now
                            self.post_event("warn", "Qulf ekranida harakat", f"Kimdir kompyuteringizdan foydalanmoqchi ({hhmm(now)})", tag="guard")
                self.check_idle_actions(now)
                self.check_timer(now)
            except Exception:
                log.exception("guard xatosi")

    def check_idle_actions(self, now: float):
        idle = self.idle
        if idle < 5:
            self.idle_done.clear()
            return
        if self.fg_fullscreen:
            return  # video/oʻyin — harakatsiz boʻlsa ham ishlayapti deb hisoblaymiz
        lm = float(self.s("idle_lock_min", 0) or 0)
        sm = float(self.s("idle_sleep_min", 0) or 0)
        if lm and idle >= lm * 60 and "lock" not in self.idle_done and not self.locked:
            self.idle_done.add("lock")
            winapi.lock_workstation()
            self.post_event("info", "Harakatsizlik: ekran qulflandi", f"{int(lm)} daqiqa davomida harakat boʻlmadi", push=False)
        if sm and idle >= sm * 60 and "sleep" not in self.idle_done:
            self.idle_done.add("sleep")
            self.post_event("info", "Harakatsizlik: uyqu rejimi", f"{int(sm)} daqiqa davomida harakat boʻlmadi — kompyuter uxlatildi")
            threading.Timer(3, winapi.suspend, args=(False,)).start()

    def check_timer(self, now: float):
        t = self.timer
        if not t:
            return
        if t["action"] != "lock" and not t.get("warned") and now >= t["at"] - 60:
            t["warned"] = True
            winapi.message_box(f"PC Pulse taymeri: 1 daqiqadan soʻng — {POWER_NAMES[t['action']]}.\n"
                               "Bekor qilish uchun ilovada “Taymerni bekor qilish” ni bosing.", "PC Pulse")
        if now >= t["at"]:
            self.timer = None
            self.post_event("info", f"Taymer: {POWER_NAMES[t['action']]}", f"Rejalashtirilgan amal bajarildi ({hhmm(now)})")
            time.sleep(1)
            self.do_power(t["action"], {"delay": 0})

    # ------------------------------------------------------------- quvvat
    def run_cmd(self, args: list[str]):
        subprocess.Popen(args, creationflags=NO_WINDOW)

    def do_power(self, action: str, args: dict):
        if not IS_WIN:
            raise ValueError("Bu amal faqat Windows da ishlaydi")
        if action == "lock":
            winapi.lock_workstation()
        elif action == "logoff":
            threading.Timer(1.5, self.run_cmd, args=(["shutdown", "/l"],)).start()
        elif action in ("shutdown", "restart"):
            delay = max(0, min(600, int(args.get("delay", 5))))
            cmd = ["shutdown", "/s" if action == "shutdown" else "/r", "/t", str(delay), "/c",
                   f"PC Pulse: masofadan {POWER_NAMES[action]} ({delay} s). Bekor qilish: shutdown /a"]
            if args.get("force") or delay == 0:
                cmd.insert(2, "/f")
            self.run_cmd(cmd)
        elif action == "sleep":
            threading.Timer(2, winapi.suspend, args=(False,)).start()
        elif action == "hibernate":
            threading.Timer(2, self.run_cmd, args=(["shutdown", "/h"],)).start()
        else:
            raise ValueError("Nomaʼlum amal")

    # ------------------------------------------------------------- buyruqlar
    def handle(self, cmd: str, a: dict):
        if cmd in ("lock", "logoff", "sleep", "hibernate", "shutdown", "restart"):
            self.do_power(cmd, a)
            return {"done": cmd}
        if cmd == "cancel_shutdown":
            self.timer = None
            if IS_WIN:
                subprocess.run(["shutdown", "/a"], capture_output=True, creationflags=NO_WINDOW)
            return {"done": True}
        if cmd == "guard_arm":
            if not IS_WIN:
                raise ValueError("Qoʻriqlash rejimi faqat Windows da")
            now = time.time()
            if a.get("lock"):
                winapi.lock_workstation()
                self.seen_locked = False
                self.guard = {"state": "watch", "since": now, "triggered_at": now, "baseline": winapi.last_input_tick(), "last_alert": now}
            else:
                grace = max(3, min(120, int(a.get("grace") or self.s("guard_grace_sec", 10))))
                self.guard = {"state": "arming", "since": now, "grace_until": now + grace}
            self.wake.set()
            return self.guard_public()
        if cmd == "guard_disarm":
            self.guard = {"state": "off"}
            self.wake.set()
            return self.guard_public()
        if cmd == "timer_set":
            act = a.get("action")
            if act not in POWER_NAMES:
                raise ValueError("Amal notoʻgʻri")
            minutes = max(1, min(1440, float(a.get("minutes", 30))))
            self.timer = {"action": act, "at": time.time() + minutes * 60, "minutes": minutes}
            self.wake.set()
            return {"action": act, "at": self.timer["at"]}
        if cmd == "timer_cancel":
            self.timer = None
            self.wake.set()
            return {"done": True}
        if cmd == "screenshot":
            if not self.has_pil:
                raise ValueError("Pillow oʻrnatilmagan (pip install Pillow)")
            if self.locked:
                raise ValueError("Ekran qulflangan — skrinshot olib boʻlmaydi")
            from PIL import ImageGrab

            img = ImageGrab.grab(all_screens=True)
            img.thumbnail((1920, 1200))
            buf = io.BytesIO()
            img.convert("RGB").save(buf, "JPEG", quality=int(a.get("quality", 65)), optimize=True)
            return {"image": base64.b64encode(buf.getvalue()).decode(), "w": img.width, "h": img.height}
        if cmd == "message":
            text = str(a.get("text", "")).strip()[:500]
            if not text:
                raise ValueError("Matn boʻsh")
            winapi.message_box(text, str(a.get("title") or "Telefondan xabar"))
            return {"done": True}
        if cmd == "media":
            self.suppress_until = time.time() + 1.5
            if not winapi.media_key(str(a.get("key")), int(a.get("times", 1))):
                raise ValueError("Media tugma qoʻllab-quvvatlanmaydi")
            return {"done": True}
        if cmd == "kill":
            name = str(a.get("name", "")).lower()
            pid = a.get("pid")
            if name in PROTECTED:
                raise ValueError("Bu tizim jarayoni — uni yopib boʻlmaydi")
            me = os.getpid()
            targets = []
            for p in psutil.process_iter(["name"]):
                if p.pid == me:
                    continue
                if (pid and p.pid == int(pid)) or (name and (p.info["name"] or "").lower() == name):
                    if (p.info["name"] or "").lower() in PROTECTED:
                        continue
                    targets.append(p)
            for p in targets:
                try:
                    p.terminate()
                except Exception:
                    pass
            _, alive = psutil.wait_procs(targets, timeout=3)
            for p in alive:
                try:
                    p.kill()
                except Exception:
                    pass
            self.procs_cache = self.collect_procs()
            return {"killed": len(targets)}
        if cmd == "procs":
            return self.collect_procs(top_mem=80, top_cpu=40, with_pids=True)
        if cmd == "sensors":
            with self.lock:
                raw = list(self.raw_sensors)
            return {"source": self.source.name if self.source else None, "error": self.lhm_error,
                    "sensors": [{**s, "value": None if s["value"] is None else round(s["value"], 3)} for s in raw]}
        if cmd == "startup_list":
            return {"items": tools.startup_list()}
        if cmd == "startup_toggle":
            tools.startup_toggle(str(a["id"]), bool(a.get("enabled")))
            return {"items": tools.startup_list()}
        if cmd == "cleanup_scan":
            return tools.cleanup_scan()
        if cmd == "cleanup_run":
            res = tools.cleanup_run(temp=bool(a.get("temp", True)), recycle=bool(a.get("recycle", True)))
            self._vol_cache = (0, [])
            return res
        if cmd == "sync":
            self.wake.set()
            return {"done": True}
        if cmd == "install_pawnio":
            if tools.pawnio_installed():
                threading.Timer(2, self.restart).start()
                return {"installed": True, "restarting": True}
            ok, msg = tools.install_pawnio()
            if not ok:
                raise ValueError(msg)
            self.pawnio = True
            threading.Timer(2, self.restart).start()  # LibreHardwareMonitor drayverni qayta ochishi uchun
            return {"installed": True, "restarting": True}
        if cmd == "update_agent":
            if not (IS_WIN and FROZEN):
                raise ValueError("Faqat Windows dagi PCPulseAgent.exe oʻzini yangilay oladi")
            if self.upd.get("state") in ("downloading", "installing"):
                return {"started": True, "version": self.upd.get("latest"), "from": VERSION}
            try:
                info = self.check_update()
            except Exception as e:
                raise ValueError(f"Yangilanishni tekshirib boʻlmadi: {e}") from e
            if not self.upd.get("available") and not a.get("force"):
                return {"latest": True, "version": VERSION}
            threading.Thread(target=self.do_update, args=(info, "manual"), name="update", daemon=True).start()
            return {"started": True, "version": info["version"], "from": VERSION}
        if cmd == "restart_agent":
            threading.Timer(1.5, self.restart).start()
            return {"restarting": True}
        if cmd == "wol":
            tools.send_magic_packet(str(a.get("mac")), a.get("broadcast"), int(a.get("port") or 9))
            return {"done": True}
        raise ValueError(f"Nomaʼlum buyruq: {cmd}")

    def exec_cmd(self, c: dict):
        cid, cmd, args = c.get("id"), c.get("cmd"), c.get("args") or {}
        log.info("buyruq: %s %s", cmd, {k: v for k, v in args.items() if k != "text"})
        try:
            result, ok, err = self.handle(cmd, args), True, None
        except Exception as e:
            result, ok, err = None, False, str(e)
            log.warning("buyruq %s xato: %s", cmd, e)
        if cid:
            for attempt in range(3):
                try:
                    self.rpc("pp_agent_result", {"p_id": cid, "p_ok": ok, "p_result": result, "p_error": err}, timeout=60)
                    break
                except Exception as e:
                    log.warning("natija yuborilmadi: %s", e)
                    time.sleep(2)

    def command_loop(self):
        backoff = 1
        while self.running:
            try:
                resp = self.rpc("pp_agent_poll", {"p_settings_ver": self.settings_ver}, timeout=15) or {}
                backoff = 1
                if "settings" in resp:
                    self.apply_settings(resp["settings"], resp.get("settings_ver", 0))
                fast = bool(resp.get("fast"))
                if fast and self.interval > 2:
                    self.interval = 2
                    self.wake.set()  # kimdir ilovani ochdi — darhol tez rejimga oʻtamiz
                cmds = resp.get("commands") or []
                for c in cmds:
                    threading.Thread(target=self.exec_cmd, args=(c,), daemon=True).start()
                time.sleep(1.2 if (fast or cmds) else 3)
            except AuthError as e:
                log.error("Token yaroqsiz: %s. Agentni qayta ulang.", e)
                time.sleep(60)
            except Exception as e:
                log.debug("poll: %s", e)
                time.sleep(backoff)
                backoff = min(30, backoff * 2)

    # ------------------------------------------------------------- telemetriya
    def snapshot(self) -> dict:
        with self.lock:
            snap = dict(self.latest)
        t = self.timer
        snap.update({
            "ts": time.time(), "day": today(), "locked": self.locked, "idle": round(self.idle),
            "guard": self.guard_public(), "timer": {"action": t["action"], "at": t["at"]} if t else None,
            "fg": self.fg_public, "usage_today": self.usage.today_summary(today()),
            "settings_ver": self.settings_ver, "agent": VERSION,
            "caps": {"power": IS_WIN, "lock": IS_WIN, "guard": IS_WIN, "usage": IS_WIN, "media": IS_WIN, "startup": IS_WIN,
                     "cleanup": IS_WIN, "message": True, "screenshot": self.has_pil and IS_WIN,
                     "fans": bool(self.source and self.source.name == "lhm"), "admin": winapi.is_admin(),
                     "pawnio_install": bool(IS_WIN and tools.pawnio_installer()), "self_update": IS_WIN and FROZEN},
            "update": self.update_public(),
        })
        return snap

    def telemetry_loop(self):
        backoff = 1
        while self.running:
            if not self.latest:
                time.sleep(0.5)
                continue
            snap = self.snapshot()
            try:
                hl = health.analyze(snap, self.sysinfo, self.alerts)
            except Exception as e:
                log.debug("health: %s", e)
                hl = None
            body = {"snapshot": snap, "health": hl, "settings_ver": self.settings_ver}
            si = None
            if self.sysinfo_pending and self.sysinfo:
                si = self.sysinfo
                body["sysinfo"] = si
            send_usage = time.time() - self.last_usage_sync > 60
            usage = self.usage.payload() if send_usage else {}
            if usage:
                body["usage"] = usage
            try:
                resp = self.rpc("pp_agent_telemetry", {"p_body": body}, timeout=25) or {}
                backoff = 1
                if isinstance(resp.get("alerts"), dict):
                    self.alerts = resp["alerts"]
                if si is not None:
                    self.sysinfo_pending = False
                if send_usage:
                    self.usage.mark_synced(usage.keys())
                    self.last_usage_sync = time.time()
                self.interval = int(resp.get("interval", 10))
                if "settings" in resp:
                    self.apply_settings(resp["settings"], resp.get("settings_ver", 0))
                wait = self.interval
            except AuthError as e:
                log.error("Token yaroqsiz: %s. Agentni qayta ulang.", e)
                wait = 60
            except Exception as e:
                log.debug("telemetry: %s", e)
                wait = backoff
                backoff = min(30, backoff * 2)
            self.wake.wait(wait)
            self.wake.clear()

    def sysinfo_loop(self):
        while self.running:
            try:
                self.sysinfo = tools.collect_sysinfo()
                self.sysinfo["agent"] = VERSION
                self.sysinfo["lhm"] = "ok" if self.source and self.source.name != "basic" else (self.lhm_error or "yoʻq")
                self.sysinfo_pending = True
                self.wake.set()
            except Exception:
                log.exception("sysinfo xatosi")
            for _ in range(3600):
                if not self.running:
                    return
                time.sleep(1)

    def ping_loop(self):
        while self.running:
            best = None
            for host, port in (("1.1.1.1", 443), ("8.8.8.8", 53)):
                try:
                    t0 = time.perf_counter()
                    with socket.create_connection((host, port), timeout=2):
                        pass
                    best = round((time.perf_counter() - t0) * 1000)
                    break
                except OSError:
                    continue
            self.ping_ms = best
            time.sleep(30)

    # ------------------------------------------------------------- ishga tushirish
    def run(self):
        threads = [threading.Thread(target=f, name=f.__name__, daemon=True) for f in
                   (self.collector_loop, self.sysinfo_loop, self.telemetry_loop, self.command_loop, self.tracker_loop, self.guard_loop,
                 self.ping_loop, self.update_loop)]
        for t in threads:
            t.start()
        log.info("PC Pulse agent %s ishlayapti → %s", VERSION, self.server)
        try:
            while True:
                time.sleep(1)
                if os.path.exists(STOP_FLAG):
                    try:
                        os.remove(STOP_FLAG)
                    except OSError:
                        pass
                    log.info("toʻxtatish soʻraldi")
                    break
        except KeyboardInterrupt:
            log.info("toʻxtatilmoqda...")
        finally:
            self.running = False
            try:
                self.usage.save()
            except Exception:
                pass
            time.sleep(0.5)
            if self.source:
                self.source.close()  # fanlarni BIOS boshqaruviga qaytarish


# --------------------------------------------------------------------------- config / ulash / oʻrnatish

def load_config() -> dict | None:
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def save_config(cfg: dict) -> None:
    tmp = CONFIG_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    os.replace(tmp, CONFIG_PATH)


def do_pair(old: dict | None, username: str, password: str, name: str) -> dict:
    old = old or {}
    try:
        res = rpc("pp_agent_pair", {"p_username": username, "p_password": password, "p_name": name or socket.gethostname(),
                                    "p_device_id": old.get("device_id")})
    except RpcError as e:
        raise RuntimeError(str(e)) from e
    except (urllib.error.URLError, OSError) as e:
        raise RuntimeError(f"Internetga ulanib boʻlmadi: {e}") from e
    cfg = {**old, "device_id": res["device_id"], "token": res["token"], "name": res["name"], "username": username}
    cfg.setdefault("sensor_source", "auto")
    save_config(cfg)
    return cfg


def ps_run(script: str, timeout: int = 60) -> tuple[int, str]:
    enc = base64.b64encode(script.encode("utf-16-le")).decode()
    r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc],
                       capture_output=True, timeout=timeout, creationflags=NO_WINDOW)
    return r.returncode, (r.stdout + r.stderr).decode("utf-8", "replace").strip()


def _psq(s: str) -> str:
    return s.replace("'", "''")


def install_autostart(exe: str) -> tuple[bool, str]:
    script = f"""
$ErrorActionPreference = 'Stop'
$exe = '{_psq(exe)}'
$user = "$env:USERDOMAIN\\$env:USERNAME"
$a = New-ScheduledTaskAction -Execute $exe -WorkingDirectory (Split-Path $exe)
$t = New-ScheduledTaskTrigger -AtLogOn -User $user
$t.Delay = 'PT15S'
$p = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest
$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
     -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName '{TASK_NAME}' -Action $a -Trigger $t -Principal $p -Settings $s -Force | Out-Null
"""
    code, out = ps_run(script)
    return code == 0, out


def start_task() -> bool:
    code, _ = ps_run(f"Start-ScheduledTask -TaskName '{TASK_NAME}'")
    return code == 0


def task_exists() -> bool:
    code, _ = ps_run(f"Get-ScheduledTask -TaskName '{TASK_NAME}' -ErrorAction Stop | Out-Null")
    return code == 0


def remove_autostart() -> None:
    ps_run(f"Unregister-ScheduledTask -TaskName '{TASK_NAME}' -Confirm:$false -ErrorAction SilentlyContinue")


def read_json(path: str) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            v = json.load(f)
        return v if isinstance(v, dict) else {}
    except Exception:
        return {}


def write_json(path: str, data: dict) -> None:
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        os.replace(tmp, path)
    except OSError as e:
        log.debug("%s yozilmadi: %s", path, e)


def same_path(a: str, b: str) -> bool:
    return os.path.normcase(os.path.abspath(a)) == os.path.normcase(os.path.abspath(b))


def my_family() -> set[int]:
    """Oʻzimiz va ota jarayonlarimiz. PyInstaller onefile exe ikki jarayon boʻlib ishlaydi (ota — yuklovchi),
    otani oʻldirsak, oʻzimiz ham yopilamiz — shuning uchun ularni hech qachon “boshqa nusxa” deb hisoblamaymiz."""
    fam = {os.getpid()}
    try:
        fam.update(p.pid for p in psutil.Process().parents())
    except Exception:
        pass
    return fam


def other_instances() -> list:
    fam = my_family()
    names = {"pcpulseagent.exe"}
    if FROZEN:
        names.add(os.path.basename(sys.executable).lower())
    out = []
    for p in psutil.process_iter(["name"]):
        if p.pid not in fam and (p.info["name"] or "").lower() in names:
            out.append(p)
    return out


def installed_procs() -> list:
    """INSTALLED_EXE dan ishlayotgan jarayonlar (oʻzimizdan tashqari)."""
    fam = my_family()
    out = []
    for p in psutil.process_iter(["name", "exe"]):
        if p.pid in fam:
            continue
        exe = p.info.get("exe") or ""
        if exe and same_path(exe, INSTALLED_EXE):
            out.append(p)
    return out


def mark_running() -> None:
    """Yangilovchi yangi versiya haqiqatan ishga tushganini shu fayl orqali biladi."""
    if FROZEN:
        write_json(VERSION_FILE, {"version": VERSION, "pid": os.getpid(), "ts": time.time(), "exe": sys.executable})


def installed_version() -> str | None:
    return read_json(VERSION_FILE).get("version")


def newer_than_installed() -> bool:
    """Shu exe oʻrnatilgan agentdan yangimi? (2.0/2.1 versiya faylini yozmagan — ular eski hisoblanadi)."""
    if not (IS_WIN and FROZEN) or same_path(sys.executable, INSTALLED_EXE) or not os.path.exists(INSTALLED_EXE):
        return False
    inst = installed_version()
    if inst:
        return updater.newer(VERSION, inst)
    try:
        return updater.sha256_file(INSTALLED_EXE) != updater.sha256_file(sys.executable)
    except OSError:
        return True


def start_agent(expect: str | None = None, timeout: float = 45) -> bool:
    """Oʻrnatilgan agentni ishga tushiradi (avval rejalashtirilgan vazifa orqali, boʻlmasa toʻgʻridan-toʻgʻri).
    expect berilsa, shu versiya haqiqatan ishga tushganini kutadi."""
    t0 = time.time()
    via_task = IS_WIN and task_exists() and start_task()
    if not via_task:
        spawn_detached(INSTALLED_EXE)
    if not expect:
        return True
    fallback = not via_task
    seen_at = None
    while time.time() - t0 < timeout:
        v = read_json(VERSION_FILE)
        pid = v.get("pid")
        if v.get("version") == expect and float(v.get("ts") or 0) >= t0 - 1 and pid and psutil.pid_exists(int(pid)):
            seen_at = seen_at or time.time()
            if time.time() - seen_at >= 5:  # birinchi soniyalarda yiqilib qolmadi
                return True
        elif seen_at:
            seen_at = None
        if not fallback and time.time() - t0 > 12 and not installed_procs():
            log.info("vazifa agentni ishga tushirmadi — toʻgʻridan-toʻgʻri ishga tushiramiz")
            spawn_detached(INSTALLED_EXE)
            fallback = True
        time.sleep(0.5)
    return False


def apply_update(stop_running: bool = False, no_start: bool = False) -> tuple[bool, str]:
    """Yangi exe tomonidan bajariladi: eski agent yopilishini kutadi, oʻzini INSTALLED_EXE oʻrniga qoʻyadi,
    ishga tushiradi va tekshiradi. Yangi versiya ishga tushmasa — eski nusxani qaytaradi."""
    if not (IS_WIN and FROZEN):
        return False, "Faqat Windows dagi .exe yangilanadi"
    src = os.path.abspath(sys.executable)
    if same_path(src, INSTALLED_EXE):
        return False, "Bu fayl allaqachon oʻrnatilgan"
    prev = installed_version() or read_json(UPDATE_STATE).get("from")
    log.info("yangilash: %s → %s (%s)", prev or "?", VERSION, src)
    if stop_running:
        stop_other_instances()
    t0 = time.time()
    while installed_procs() and time.time() - t0 < 40:
        time.sleep(0.5)
    if installed_procs():
        stop_other_instances()
        psutil.wait_procs(installed_procs(), timeout=5)
    had_old = os.path.exists(INSTALLED_EXE)
    if had_old:
        try:
            shutil.copy2(INSTALLED_EXE, PREV_EXE)
        except OSError as e:
            log.warning("zaxira nusxa olinmadi: %s", e)
            had_old = False
    err = None
    for _ in range(30):
        try:
            shutil.copy2(src, INSTALLED_EXE + ".new")
            os.replace(INSTALLED_EXE + ".new", INSTALLED_EXE)
            err = None
            break
        except OSError as e:
            err = e
            time.sleep(1)
    state = {"from": prev, "to": VERSION, "ts": time.time(), "reported": False}
    if err:
        log.error("faylni almashtirib boʻlmadi: %s", err)
        write_json(UPDATE_STATE, {**state, "ok": False, "error": f"Faylni almashtirib boʻlmadi: {err}"})
        if not no_start and had_old:
            start_agent()
        return False, f"Faylni almashtirib boʻlmadi: {err}"
    if no_start:
        write_json(UPDATE_STATE, {**state, "ok": True})
        return True, ""
    if not task_exists():
        install_autostart(INSTALLED_EXE)
    if start_agent(expect=VERSION):
        write_json(UPDATE_STATE, {**state, "ok": True})
        log.info("yangilandi: %s", VERSION)
        return True, ""
    log.error("yangi versiya %s ishga tushmadi — oldingi versiyaga qaytarilmoqda", VERSION)
    for p in installed_procs():
        try:
            p.kill()
        except Exception:
            pass
    restored = False
    if had_old:
        for _ in range(15):
            try:
                shutil.copy2(PREV_EXE, INSTALLED_EXE)
                restored = True
                break
            except OSError:
                time.sleep(1)
    write_json(UPDATE_STATE, {**state, "ok": False, "bad": VERSION,
                              "error": f"{VERSION} ishga tushmadi" + (" — oldingi versiya qaytarildi" if restored else "")})
    start_agent()
    return False, f"Yangi versiya ishga tushmadi{' — oldingi versiya qaytarildi' if restored else ''}"


def stop_other_instances(timeout: float = 8) -> None:
    procs = other_instances()
    if not procs:
        return
    try:
        open(STOP_FLAG, "w").close()  # chiroyli toʻxtash: fanlar BIOS ga qaytariladi
    except OSError:
        pass
    _, alive = psutil.wait_procs(procs, timeout=timeout)
    for p in alive:
        try:
            p.kill()
        except Exception:
            pass
    try:
        os.remove(STOP_FLAG)
    except OSError:
        pass


def install_and_start() -> tuple[bool, str]:
    if not (IS_WIN and FROZEN):
        return False, "Avtomatik ishga tushirish faqat Windows dagi .exe versiyasida ishlaydi"
    target = INSTALLED_EXE
    try:
        if os.path.normcase(os.path.abspath(sys.executable)) != os.path.normcase(target):
            stop_other_instances()
            shutil.copy2(sys.executable, target)
    except OSError as e:
        return False, f"Faylni nusxalab boʻlmadi: {e}"
    ok, out = install_autostart(target)
    if not ok:
        return False, out
    return start_task(), ""


def spawn_detached(exe: str) -> None:
    flags = 0x00000008 | 0x00000200 if IS_WIN else 0  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    subprocess.Popen([exe], creationflags=flags, close_fds=True)


def first_run_gui(cfg: dict | None) -> dict | None:
    import gui

    res = gui.setup_window(lambda u, p, n: do_pair(load_config(), u, p, n), socket.gethostname(), cloud.WEB_URL,
                           prefill_user=(cfg or {}).get("username", ""), show_autostart=IS_WIN and FROZEN)
    return res


def manage_flow(cfg: dict | None) -> None:
    import gui

    cfg = cfg or {}
    can_update = FROZEN and os.path.normcase(os.path.abspath(sys.executable)) != os.path.normcase(INSTALLED_EXE)
    action = gui.manage_window(cfg.get("name", ""), cfg.get("username", ""), cloud.WEB_URL, can_update)
    if action == "open":
        import webbrowser

        webbrowser.open(cloud.WEB_URL)
    elif action == "repair":
        stop_other_instances()
        res = gui.setup_window(lambda u, p, n: do_pair(load_config(), u, p, n), cfg.get("name") or socket.gethostname(),
                               cloud.WEB_URL, prefill_user=cfg.get("username", ""), show_autostart=False)
        if res:
            if IS_WIN and FROZEN and task_exists():
                start_task()
            else:
                spawn_detached(sys.executable)
            gui.info("PC Pulse", "Kompyuter qayta ulandi va agent ishga tushdi.")
    elif action == "restart":
        stop_other_instances()
        if IS_WIN and FROZEN and task_exists():
            start_task()
        else:
            spawn_detached(sys.executable)
        gui.info("PC Pulse", "Agent qayta ishga tushirildi.")
    elif action == "update":
        ok, msg = install_and_start()
        gui.info("PC Pulse", "Yangilandi va qayta ishga tushirildi." if ok else f"Yangilab boʻlmadi: {msg}")
    elif action == "remove":
        stop_other_instances()
        remove_autostart()
        gui.info("PC Pulse", "Agent toʻxtatildi va avtoyuklanishdan olib tashlandi.\n"
                             "Kompyuterni saytdagi Sozlamalar → Kompyuterlar boʻlimidan ham oʻchirishingiz mumkin.")


def manual_update_flow() -> None:
    """Foydalanuvchi yangi PCPulseAgent.exe ni ishga tushirdi, eskisi esa ishlab turibdi: savolsiz yangilaymiz."""
    import gui

    old = installed_version() or "eski versiya"
    try:
        ok, msg = gui.busy_window("PC Pulse", f"PC Pulse yangilanmoqda…\n{old} → {VERSION}", lambda: apply_update(stop_running=True))
    except Exception as e:
        ok, msg = False, str(e)
    if ok:
        gui.info("PC Pulse", f"Tayyor! Agent {VERSION} versiyaga yangilandi va fon rejimida ishlayapti.\n\n"
                             "Bundan keyingi yangilanishlar avtomatik oʻrnatiladi — bu faylni qayta yuklab olish shart emas.")
    else:
        gui.info("PC Pulse", f"Yangilab boʻlmadi: {msg}\n\nKompyuterni qayta ishga tushirib, faylni yana bir bor ishga tushirib koʻring.")


def check_update_cli(path: str) -> int:
    """CI uchun: latest.json ni oʻqiydi, exe ni yuklab, SHA-256 ni tekshiradi."""
    import tempfile

    res: dict = {"version": VERSION, "url": cloud.UPDATE_URL}
    try:
        info = updater.fetch_latest(UA)
        res["latest"] = info
        res["newer_than_me"] = updater.newer(info["version"], VERSION)
        d = os.path.join(tempfile.gettempdir(), "pcpulse-update-test")
        p = updater.download(info, d, UA)
        res["downloaded"] = p
        res["sha_ok"] = updater.sha256_file(p) == info["sha256"]
        if FROZEN:
            res["same_as_me"] = updater.sha256_file(sys.executable) == info["sha256"]
        updater.cleanup(d)
    except Exception as e:
        res["error"] = repr(e)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
    return 0 if res.get("sha_ok") else 2


def setup_cli(cfg: dict | None, args) -> dict:
    print("\n=== PC Pulse agentini ulash ===\n")
    user = args.user or input("Username: ").strip()
    pw = args.password or getpass.getpass("Parol: ")
    default_name = (cfg or {}).get("name") or socket.gethostname()
    name = args.name or (input(f"Kompyuter nomi [{default_name}]: ").strip() if sys.stdin and sys.stdin.isatty() else "") or default_name
    try:
        cfg = do_pair(cfg, user, pw, name)
    except RuntimeError as e:
        print(f"\n❌ Xato: {e}")
        sys.exit(1)
    print(f"\n✅ Ulandi! Qurilma: {cfg['name']} ({cfg['device_id']}).\n")
    return cfg


def selftest(path: str) -> int:
    """CI va muammolarni aniqlash uchun: kutubxonalar va LibreHardwareMonitor yuklanishini tekshiradi."""
    import platform
    import traceback

    res: dict = {"pawnio_installer": tools.pawnio_installer(), "pawnio_installed": tools.pawnio_installed(), "version": VERSION, "update_url": cloud.UPDATE_URL, "frozen": FROZEN, "python": platform.python_version(), "lhm_dir": LHM_DIR, "admin": winapi.is_admin()}
    try:
        res["lhm_files"] = sorted(os.listdir(LHM_DIR))[:40]
    except Exception as e:
        res["lhm_files"] = f"yoʻq: {e}"
    for mod in ("psutil", "PIL", "tkinter", "pythonnet", "clr_loader"):
        try:
            m = __import__(mod)
            res[f"mod_{mod}"] = getattr(m, "__version__", "ok")
        except Exception as e:
            res[f"mod_{mod}"] = f"ERROR {e!r}"
    try:
        src = sensors.LhmDll(LHM_DIR)
        raw = src.read()
        n = sensors.normalize(raw)
        res["lhm"] = "ok"
        res["lhm_sensors"] = len(raw)
        res["lhm_hw"] = sorted({s["hw"] for s in raw})
        res["cpu"] = {k: n["cpu"].get(k) for k in ("name", "load", "temp")}
        res["gpus"] = [g.get("name") for g in n["gpus"]]
        res["voltages"] = len(n["voltages"])
        res["fans"] = len(n["fans"])
        src.close()
    except Exception:
        res["lhm"] = "ERROR " + traceback.format_exc()[-1500:]
    try:
        si = tools.collect_sysinfo()
        res["sysinfo"] = {k: si.get(k) for k in ("os", "board", "cpu")}
    except Exception as e:
        res["sysinfo"] = f"ERROR {e!r}"
    try:
        a = Agent({"token": "x"})
        snap = a.build_snapshot(sensors.normalize([]), 0)
        res["snapshot_keys"] = sorted(snap)
        res["health"] = health.analyze(snap, None, {})["title"]
    except Exception:
        res["snapshot"] = "ERROR " + traceback.format_exc()[-800:]
    with open(path, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=2, default=str)
    ok = all(not str(res.get(f"mod_{m}", "")).startswith("ERROR") for m in ("psutil", "PIL")) and "snapshot" not in res
    return 0 if ok else 2


def setup_logging(debug: bool):
    logging.getLogger().setLevel(logging.DEBUG if debug else logging.INFO)
    fh = logging.handlers.RotatingFileHandler(os.path.join(DATA_DIR, "agent.log"), maxBytes=1_000_000, backupCount=3, encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logging.getLogger().addHandler(fh)
    if sys.stdout and hasattr(sys.stdout, "isatty") and sys.stdout.isatty():
        ch = logging.StreamHandler()
        ch.setFormatter(logging.Formatter("%(asctime)s %(message)s", "%H:%M:%S"))
        logging.getLogger().addHandler(ch)


def bind_lock():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", LOCK_PORT))
        return s
    except OSError:
        s.close()
        return None


def main():
    ap = argparse.ArgumentParser(description="PC Pulse agent")
    ap.add_argument("--setup", action="store_true", help="akkauntga qayta ulash")
    ap.add_argument("--user")
    ap.add_argument("--password")
    ap.add_argument("--name")
    ap.add_argument("--uninstall", action="store_true")
    ap.add_argument("--selftest", metavar="JSON")
    ap.add_argument("--version", action="store_true")
    ap.add_argument("--sensor-source", choices=["auto", "lhm", "lhm-http", "basic"])
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--restarted", action="store_true", help=argparse.SUPPRESS)
    ap.add_argument("--apply-update", action="store_true", help=argparse.SUPPRESS)
    ap.add_argument("--no-start", action="store_true", help=argparse.SUPPRESS)
    ap.add_argument("--check-update", metavar="JSON", help=argparse.SUPPRESS)
    ap.add_argument("--test-handoff", metavar="EXE", help=argparse.SUPPRESS)  # CI: eski agent yangilovchini ishga tushirib chiqib ketishi
    args, _ = ap.parse_known_args()
    if sys.stdout and hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    if args.version:
        print(VERSION)
        return
    if args.selftest:
        sys.exit(selftest(args.selftest))
    if args.check_update:
        sys.exit(check_update_cli(args.check_update))
    setup_logging(args.debug)
    if args.test_handoff:
        subprocess.Popen([args.test_handoff, "--apply-update"], creationflags=0x00000008 | 0x00000200 if IS_WIN else 0,
                         close_fds=True, cwd=os.path.dirname(os.path.abspath(args.test_handoff)))
        os._exit(0)
    if args.apply_update:  # eski agent yangi versiyani yuklab, shu rejimda ishga tushirdi
        ok, msg = apply_update(no_start=args.no_start)
        if not ok:
            log.error("yangilanish: %s", msg)
        sys.exit(0 if ok else 3)
    cfg = load_config()
    import gui

    if args.uninstall:
        stop_other_instances()
        remove_autostart()
        return

    lock = bind_lock()
    if lock is None and args.restarted:  # oldingi nusxa yopilishini kutamiz
        for _ in range(40):
            time.sleep(0.5)
            lock = bind_lock()
            if lock:
                break
    if lock is None:  # boshqa nusxa allaqachon ishlayapti
        if FROZEN and same_path(sys.executable, INSTALLED_EXE):  # vazifa rejalashtiruvchisi ikkinchi marta ishga tushirdi
            log.info("agent allaqachon ishlayapti — chiqamiz")
            return
        if gui.available() and newer_than_installed():  # yangi exe ni yuklab ishga tushirishdi — soʻramasdan yangilaymiz
            manual_update_flow()
        elif gui.available():
            manage_flow(cfg)
        else:
            log.error("Agent allaqachon ishlayapti.")
        return

    if cfg and cfg.get("token") and not args.setup and gui.available() and newer_than_installed():
        lock.close()  # eski agent hozir ishlamayapti, lekin oʻrnatilgan — uni shu yangi fayl bilan almashtiramiz
        manual_update_flow()
        return
    mark_running()
    if args.setup or not cfg or not cfg.get("token"):
        tty = bool(sys.stdin and sys.stdin.isatty())
        if args.user and args.password or (tty and not FROZEN):
            cfg = setup_cli(cfg, args)
            if args.setup:
                return
        elif gui.available():
            res = first_run_gui(cfg)
            if not res:
                return
            cfg = load_config()
            if IS_WIN and tools.pawnio_installed() is False and not tools.pawnio_installer():
                if gui.ask("PC Pulse", "Harorat, PSU kuchlanishi va fanlarni koʻrish uchun bepul PawnIO drayveri kerak.\n\n"
                                       "Yuklab olish sahifasini ochaymi? (PawnIO_setup.exe ni oʻrnatib, kompyuterni qayta ishga tushiring)"):
                    import webbrowser

                    webbrowser.open("https://github.com/namazso/PawnIO.Setup/releases/latest")
            if res.get("autostart"):
                lock.close()
                ok, msg = install_and_start()
                if ok:
                    gui.info("PC Pulse", "Tayyor! Agent fon rejimida ishlayapti va Windows bilan birga avtomatik ishga tushadi.\n\n"
                                         "Telefoningizda saytni oching — kompyuteringiz u yerda koʻrinadi.")
                    return
                log.warning("Avtomatik ishga tushirish oʻrnatilmadi: %s", msg)
                gui.info("PC Pulse", f"Avtomatik ishga tushirishni oʻrnatib boʻlmadi:\n{msg[:300]}\n\nAgent hozircha shu oynasiz rejimda ishlaydi.")
                lock = bind_lock()
                if lock is None:
                    return
        else:
            log.error("Sozlama topilmadi. Konsolda: python agent.py --setup")
            sys.exit(1)

    if args.sensor_source:
        cfg["sensor_source"] = args.sensor_source
        save_config(cfg)
    mark_running()
    if IS_WIN and not winapi.is_admin():
        log.warning("Administrator huquqi yoʻq — harorat/kuchlanish/fan sensorlari va fan boshqaruvi cheklangan boʻladi.")
    Agent(cfg, lock).run()


if __name__ == "__main__":
    main()
