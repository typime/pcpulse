"""PC Pulse oynasi: saytni Windows’ning WebView2 dvigateli (pywebview) orqali alohida dastur oynasida ochadi.

Bitta oyna: ikkinchi marta ochilsa, mavjud oyna oldinga chiqariladi (127.0.0.1:47652 orqali).
WebView2 yoki pywebview ishlamasa — sayt odatiy brauzerda ochiladi.
"""
from __future__ import annotations

import json
import logging
import os
import socket
import threading
import time
import webbrowser

import cloud

log = logging.getLogger("pcpulse.window")
WIN_PORT = 47652


def app_url() -> str:
    return cloud.WEB_URL.rstrip("/") + "/?app=desktop#/overview"


def _focus_existing() -> bool:
    try:
        with socket.create_connection(("127.0.0.1", WIN_PORT), timeout=1.5) as s:
            s.sendall(b"show")
        return True
    except OSError:
        return False


def _bind() -> socket.socket | None:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
        s.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
    try:
        s.bind(("127.0.0.1", WIN_PORT))
        s.listen(4)
        return s
    except OSError:
        s.close()
        return None


def open_window(data_dir: str) -> int:
    if _focus_existing():
        return 0
    srv = _bind()
    if srv is None:  # boshqa oyna hozir ochilmoqda
        time.sleep(2)
        return 0 if _focus_existing() else 1
    try:
        import webview  # pywebview
    except Exception as e:  # noqa: BLE001
        log.warning("pywebview yuklanmadi (%s) — brauzerda ochamiz", e)
        srv.close()
        webbrowser.open(cloud.WEB_URL)
        return 1

    win = webview.create_window("PC Pulse", app_url(), width=1320, height=860, min_size=(420, 640),
                                background_color="#060912", text_select=True)

    def serve():
        while True:
            try:
                c, _ = srv.accept()
                data = c.recv(16)
                c.close()
            except OSError:
                return
            if data == b"show":
                try:
                    win.restore()
                    win.show()
                    win.on_top = True
                    time.sleep(0.3)
                    win.on_top = False
                except Exception as e:  # noqa: BLE001
                    log.debug("oynani oldinga chiqarib boʻlmadi: %s", e)

    threading.Thread(target=serve, name="window-ipc", daemon=True).start()
    try:
        os.makedirs(os.path.join(data_dir, "webview"), exist_ok=True)
        webview.start(gui="edgechromium", private_mode=False, storage_path=os.path.join(data_dir, "webview"))
    except Exception as e:  # noqa: BLE001
        log.error("oyna ochilmadi (%s) — brauzerda ochamiz", e)
        webbrowser.open(cloud.WEB_URL)
        return 1
    finally:
        srv.close()
    return 0


def window_test(out_path: str, url: str | None = None) -> int:
    """CI uchun: oynani ochadi, sahifa yuklanib React ilovasi chizilganini tekshiradi, natijani JSON ga yozadi."""
    res: dict = {"url": url or app_url()}
    try:
        import webview
    except Exception as e:  # noqa: BLE001
        res["error"] = f"pywebview: {e!r}"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(res, f, ensure_ascii=False, indent=2)
        return 2
    win = webview.create_window("PC Pulse — sinov", res["url"], width=1280, height=820)

    def probe():
        try:
            res["loaded"] = bool(win.events.loaded.wait(90))
            js = ("JSON.stringify({shell: document.documentElement.getAttribute('data-shell'), ui: document.documentElement.getAttribute('data-ui'),"
                  " title: document.title, rendered: !!document.querySelector('#root .auth, #root .shell'), font: document.fonts && document.fonts.check('16px \"Pulse Sans\"'),"
                  " ua: navigator.userAgent})")
            v = None
            for _ in range(60):
                v = win.evaluate_js(js)
                if v and '"rendered":true' in v:
                    break
                time.sleep(0.5)
            res["probe"] = json.loads(v) if v else None
        except Exception as e:  # noqa: BLE001
            res["error"] = repr(e)
        finally:
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(res, f, ensure_ascii=False, indent=2)
            try:
                win.destroy()
            except Exception:  # noqa: BLE001
                pass

    try:
        webview.start(probe, gui="edgechromium", private_mode=True)
    except Exception as e:  # noqa: BLE001
        res["error"] = repr(e)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(res, f, ensure_ascii=False, indent=2)
    p = res.get("probe") or {}
    return 0 if p.get("rendered") and p.get("shell") == "desktop-app" else 2
