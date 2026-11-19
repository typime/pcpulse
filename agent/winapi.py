"""Windows API (ctypes) — qoʻshimcha kutubxonasiz: idle vaqt, ekran qulfi, faol oyna, fullscreen,
fayl tavsifi, xabar oynasi, media tugmalar, uyqu rejimi, savat (Recycle Bin)."""
from __future__ import annotations

import ctypes
import os
import struct
import sys
import threading
import time

IS_WIN = sys.platform == "win32"

if IS_WIN:
    from ctypes import wintypes

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    shell32 = ctypes.WinDLL("shell32", use_last_error=True)
    advapi32 = ctypes.WinDLL("advapi32", use_last_error=True)
    powrprof = ctypes.WinDLL("powrprof", use_last_error=True)
    version = ctypes.WinDLL("version", use_last_error=True)

    class LASTINPUTINFO(ctypes.Structure):
        _fields_ = [("cbSize", wintypes.UINT), ("dwTime", wintypes.DWORD)]

    class MONITORINFO(ctypes.Structure):
        _fields_ = [("cbSize", wintypes.DWORD), ("rcMonitor", wintypes.RECT), ("rcWork", wintypes.RECT), ("dwFlags", wintypes.DWORD)]

    class SHQUERYRBINFO(ctypes.Structure):
        if ctypes.sizeof(ctypes.c_void_p) == 4:
            _pack_ = 1
        _fields_ = [("cbSize", wintypes.DWORD), ("i64Size", ctypes.c_int64), ("i64NumItems", ctypes.c_int64)]

    class LUID(ctypes.Structure):
        _fields_ = [("LowPart", wintypes.DWORD), ("HighPart", wintypes.LONG)]

    class LUID_AND_ATTRIBUTES(ctypes.Structure):
        _fields_ = [("Luid", LUID), ("Attributes", wintypes.DWORD)]

    class TOKEN_PRIVILEGES(ctypes.Structure):
        _fields_ = [("PrivilegeCount", wintypes.DWORD), ("Privileges", LUID_AND_ATTRIBUTES * 1)]

    WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    user32.GetLastInputInfo.argtypes = [ctypes.POINTER(LASTINPUTINFO)]
    user32.GetForegroundWindow.restype = wintypes.HWND
    user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user32.GetWindowThreadProcessId.restype = wintypes.DWORD
    user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
    user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user32.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
    user32.MonitorFromWindow.argtypes = [wintypes.HWND, wintypes.DWORD]
    user32.MonitorFromWindow.restype = wintypes.HMONITOR
    user32.GetMonitorInfoW.argtypes = [wintypes.HMONITOR, ctypes.POINTER(MONITORINFO)]
    user32.EnumChildWindows.argtypes = [wintypes.HWND, WNDENUMPROC, wintypes.LPARAM]
    user32.MessageBoxW.argtypes = [wintypes.HWND, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.UINT]
    user32.keybd_event.argtypes = [wintypes.BYTE, wintypes.BYTE, wintypes.DWORD, ctypes.c_void_p]
    kernel32.GetTickCount.restype = wintypes.DWORD
    version.GetFileVersionInfoSizeW.argtypes = [wintypes.LPCWSTR, ctypes.POINTER(wintypes.DWORD)]
    version.GetFileVersionInfoSizeW.restype = wintypes.DWORD
    version.GetFileVersionInfoW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p]
    version.VerQueryValueW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR, ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(wintypes.UINT)]
    shell32.SHQueryRecycleBinW.argtypes = [wintypes.LPCWSTR, ctypes.POINTER(SHQUERYRBINFO)]
    shell32.SHQueryRecycleBinW.restype = ctypes.c_long
    shell32.SHEmptyRecycleBinW.argtypes = [wintypes.HWND, wintypes.LPCWSTR, wintypes.DWORD]
    shell32.SHEmptyRecycleBinW.restype = ctypes.c_long
    advapi32.OpenProcessToken.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.POINTER(wintypes.HANDLE)]
    advapi32.LookupPrivilegeValueW.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR, ctypes.POINTER(LUID)]
    advapi32.AdjustTokenPrivileges.argtypes = [wintypes.HANDLE, wintypes.BOOL, ctypes.POINTER(TOKEN_PRIVILEGES), wintypes.DWORD, ctypes.c_void_p, ctypes.c_void_p]
    kernel32.GetCurrentProcess.restype = wintypes.HANDLE
    powrprof.SetSuspendState.argtypes = [wintypes.BOOLEAN, wintypes.BOOLEAN, wintypes.BOOLEAN]


def is_admin() -> bool:
    if not IS_WIN:
        return os.geteuid() == 0 if hasattr(os, "geteuid") else False
    try:
        return bool(shell32.IsUserAnAdmin())
    except Exception:
        return False


def last_input_tick() -> int | None:
    if not IS_WIN:
        return None
    lii = LASTINPUTINFO()
    lii.cbSize = ctypes.sizeof(LASTINPUTINFO)
    if user32.GetLastInputInfo(ctypes.byref(lii)):
        return int(lii.dwTime)
    return None


def idle_seconds() -> float:
    tick = last_input_tick()
    if tick is None:
        return 0.0
    return ((kernel32.GetTickCount() - tick) & 0xFFFFFFFF) / 1000.0


def lock_workstation() -> bool:
    return bool(IS_WIN and user32.LockWorkStation())


def _window_text(hwnd) -> str:
    n = user32.GetWindowTextLengthW(hwnd)
    buf = ctypes.create_unicode_buffer(n + 1)
    user32.GetWindowTextW(hwnd, buf, n + 1)
    return buf.value


def _class_name(hwnd) -> str:
    buf = ctypes.create_unicode_buffer(256)
    user32.GetClassNameW(hwnd, buf, 256)
    return buf.value


def _pid_of(hwnd) -> int:
    pid = wintypes.DWORD(0)
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    return int(pid.value)


def foreground() -> dict | None:
    """{"hwnd", "pid", "title", "cls"} — UWP ilovalar uchun haqiqiy jarayonni topadi."""
    if not IS_WIN:
        return None
    hwnd = user32.GetForegroundWindow()
    if not hwnd:
        return None
    pid = _pid_of(hwnd)
    cls = _class_name(hwnd)
    if cls == "ApplicationFrameWindow":  # UWP (Kalkulyator, Sozlamalar, ...)
        found = []

        def cb(child, _):
            cpid = _pid_of(child)
            if cpid and cpid != pid:
                found.append(cpid)
                return False
            return True

        user32.EnumChildWindows(hwnd, WNDENUMPROC(cb), 0)
        if found:
            pid = found[0]
    return {"hwnd": hwnd, "pid": pid, "title": _window_text(hwnd), "cls": cls}


def is_fullscreen(hwnd) -> bool:
    if not IS_WIN or not hwnd:
        return False
    if _class_name(hwnd) in ("Progman", "WorkerW", "Shell_TrayWnd"):
        return False
    r = wintypes.RECT()
    if not user32.GetWindowRect(hwnd, ctypes.byref(r)):
        return False
    mon = user32.MonitorFromWindow(hwnd, 2)
    mi = MONITORINFO()
    mi.cbSize = ctypes.sizeof(MONITORINFO)
    if not user32.GetMonitorInfoW(mon, ctypes.byref(mi)):
        return False
    m = mi.rcMonitor
    return r.left <= m.left and r.top <= m.top and r.right >= m.right and r.bottom >= m.bottom


_desc_cache: dict[str, str | None] = {}


def file_description(path: str | None) -> str | None:
    if not IS_WIN or not path:
        return None
    if path in _desc_cache:
        return _desc_cache[path]
    result = None
    try:
        size = version.GetFileVersionInfoSizeW(path, None)
        if size:
            buf = ctypes.create_string_buffer(size)
            if version.GetFileVersionInfoW(path, 0, size, buf):
                ptr, ln = ctypes.c_void_p(), wintypes.UINT()
                langs = []
                if version.VerQueryValueW(buf, "\\VarFileInfo\\Translation", ctypes.byref(ptr), ctypes.byref(ln)) and ln.value >= 4:
                    raw = ctypes.string_at(ptr.value, ln.value)
                    for i in range(0, len(raw) - 3, 4):
                        lang, cp = struct.unpack("<HH", raw[i:i + 4])
                        langs.append(f"{lang:04x}{cp:04x}")
                langs += ["040904b0", "040904e4", "000004b0"]
                for key in ("FileDescription", "ProductName"):
                    for lc in langs:
                        if version.VerQueryValueW(buf, f"\\StringFileInfo\\{lc}\\{key}", ctypes.byref(ptr), ctypes.byref(ln)) and ln.value > 1:
                            val = ctypes.wstring_at(ptr.value).strip()
                            if val:
                                result = val
                                break
                    if result:
                        break
    except Exception:
        result = None
    _desc_cache[path] = result
    return result


def message_box(text: str, title: str = "PC Pulse") -> None:
    if not IS_WIN:
        print(f"[{title}] {text}")
        return
    # MB_OK | MB_ICONINFORMATION | MB_SYSTEMMODAL | MB_SETFOREGROUND | MB_TOPMOST
    flags = 0x0 | 0x40 | 0x1000 | 0x10000 | 0x40000
    threading.Thread(target=user32.MessageBoxW, args=(None, text, title, flags), daemon=True).start()


MEDIA_KEYS = {"mute": 0xAD, "vol_down": 0xAE, "vol_up": 0xAF, "next": 0xB0, "prev": 0xB1, "stop": 0xB2, "play": 0xB3}


def media_key(name: str, times: int = 1) -> bool:
    vk = MEDIA_KEYS.get(name)
    if not IS_WIN or vk is None:
        return False
    for _ in range(max(1, min(10, times))):
        user32.keybd_event(vk, 0, 0x1, None)       # KEYEVENTF_EXTENDEDKEY
        user32.keybd_event(vk, 0, 0x1 | 0x2, None)  # + KEYEVENTF_KEYUP
        time.sleep(0.03)
    return True


def enable_privilege(name: str = "SeShutdownPrivilege") -> bool:
    if not IS_WIN:
        return False
    token = wintypes.HANDLE()
    if not advapi32.OpenProcessToken(kernel32.GetCurrentProcess(), 0x0020 | 0x0008, ctypes.byref(token)):
        return False
    luid = LUID()
    if not advapi32.LookupPrivilegeValueW(None, name, ctypes.byref(luid)):
        return False
    tp = TOKEN_PRIVILEGES()
    tp.PrivilegeCount = 1
    tp.Privileges[0].Luid = luid
    tp.Privileges[0].Attributes = 0x2  # SE_PRIVILEGE_ENABLED
    ok = advapi32.AdjustTokenPrivileges(token, False, ctypes.byref(tp), 0, None, None)
    kernel32.CloseHandle(token)
    return bool(ok)


def suspend(hibernate: bool = False) -> bool:
    if not IS_WIN:
        return False
    enable_privilege("SeShutdownPrivilege")
    return bool(powrprof.SetSuspendState(hibernate, False, False))


def recycle_bin_info() -> tuple[int, int]:
    if not IS_WIN:
        return 0, 0
    info = SHQUERYRBINFO()
    info.cbSize = ctypes.sizeof(SHQUERYRBINFO)
    if shell32.SHQueryRecycleBinW(None, ctypes.byref(info)) == 0:
        return int(info.i64Size), int(info.i64NumItems)
    return 0, 0


def empty_recycle_bin() -> bool:
    if not IS_WIN:
        return False
    # SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND
    return shell32.SHEmptyRecycleBinW(None, None, 0x7) in (0, -2147418113)
