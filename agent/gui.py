"""Kichik Tkinter oynalari: birinchi ulash va boshqaruv. Minimal, qorongʻi uslub."""
from __future__ import annotations

import os
import sys
import threading
import webbrowser

BG = "#0b1322"
CARD = "#16223d"
FG = "#e9eff9"
MUTED = "#9aa6bd"
ACCENT = "#5ee1d9"
ERR = "#ff9a9a"
FONT = "Segoe UI" if sys.platform == "win32" else "DejaVu Sans"


def available() -> bool:
    try:
        import tkinter  # noqa: F401
    except Exception:
        return False
    return sys.platform == "win32" or bool(os.environ.get("DISPLAY"))


def _root(title: str, w: int, h: int):
    import tkinter as tk

    root = tk.Tk()
    root.title(title)
    root.configure(bg=BG)
    root.resizable(False, False)
    ico = os.path.join(getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__))), "assets", "icon.ico")
    if sys.platform == "win32" and os.path.exists(ico):
        try:
            root.iconbitmap(ico)
        except Exception:
            pass
    root.update_idletasks()
    x = (root.winfo_screenwidth() - w) // 2
    y = (root.winfo_screenheight() - h) // 3
    root.geometry(f"{w}x{h}+{x}+{y}")
    root.attributes("-topmost", True)
    root.after(600, lambda: root.attributes("-topmost", False))
    return root


def _button(parent, text, cmd, primary=False):
    import tkinter as tk

    b = tk.Button(parent, text=text, command=cmd, relief="flat", cursor="hand2", bd=0,
                  bg=ACCENT if primary else CARD, fg="#062625" if primary else FG,
                  activebackground="#7fe9e3" if primary else "#22325a", activeforeground="#062625" if primary else FG,
                  font=(FONT, 11, "bold" if primary else "normal"))
    return b


def setup_window(pair_fn, default_name: str, web_url: str, prefill_user: str = "", show_autostart: bool = True) -> dict | None:
    """pair_fn(username, password, name) -> dict (xato boʻlsa Exception). Natija: {"autostart": bool} yoki None."""
    import tkinter as tk

    root = _root("PC Pulse — kompyuterni ulash", 430, 500 if show_autostart else 470)
    f = tk.Frame(root, bg=BG, padx=28, pady=22)
    f.pack(fill="both", expand=True)
    tk.Label(f, text="PC Pulse", bg=BG, fg=FG, font=(FONT, 20, "bold")).pack(anchor="w")
    tk.Label(f, text="Telefoningizdagi akkaunt bilan kiring", bg=BG, fg=MUTED, font=(FONT, 10)).pack(anchor="w", pady=(0, 16))

    def field(label, show="", value=""):
        tk.Label(f, text=label, bg=BG, fg=MUTED, font=(FONT, 9, "bold")).pack(anchor="w")
        e = tk.Entry(f, show=show, bg="#070e1b", fg=FG, insertbackground=FG, relief="flat", highlightthickness=1,
                     highlightbackground="#2a3a5a", highlightcolor=ACCENT, font=(FONT, 11))
        e.pack(fill="x", ipady=7, pady=(4, 12))
        if value:
            e.insert(0, value)
        return e

    eu = field("Username", value=prefill_user)
    ep = field("Parol", show="•")
    en = field("Kompyuter nomi", value=default_name)
    auto = tk.BooleanVar(value=True)
    if show_autostart:
        tk.Checkbutton(f, text="Windows bilan birga avtomatik ishga tushirish", variable=auto, bg=BG, fg=FG, selectcolor=CARD,
                       activebackground=BG, activeforeground=FG, font=(FONT, 10), bd=0, highlightthickness=0).pack(anchor="w", pady=(0, 8))
    status = tk.Label(f, text="", bg=BG, fg=ERR, font=(FONT, 9), wraplength=370, justify="left")
    status.pack(anchor="w")
    btn = _button(f, "Ulash", None, primary=True)
    btn.pack(fill="x", ipady=8, pady=(8, 10))
    link = tk.Label(f, text="Akkaunt yoʻqmi? Saytda roʻyxatdan oʻting", bg=BG, fg=ACCENT, cursor="hand2", font=(FONT, 9, "underline"))
    link.pack(anchor="w")
    link.bind("<Button-1>", lambda e: webbrowser.open(web_url))

    result: dict = {}

    def done(r, err):
        if err:
            btn.config(state="normal", text="Ulash")
            status.config(text=err, fg=ERR)
            return
        result.update(r or {})
        result["autostart"] = bool(auto.get()) if show_autostart else False
        root.destroy()

    def submit(*_):
        u, p, n = eu.get().strip(), ep.get(), en.get().strip()
        if not u or not p:
            status.config(text="Username va parolni kiriting", fg=ERR)
            return
        btn.config(state="disabled", text="Ulanmoqda…")
        status.config(text="")

        def work():
            try:
                r = pair_fn(u, p, n)
                root.after(0, lambda: done(r, None))
            except Exception as ex:  # noqa: BLE001
                msg = str(ex) or "Xato"
                root.after(0, lambda: done(None, msg))

        threading.Thread(target=work, daemon=True).start()

    btn.config(command=submit)
    root.bind("<Return>", submit)
    (ep if prefill_user else eu).focus_set()
    root.mainloop()
    return result or None


def manage_window(name: str, username: str, web_url: str, can_update: bool) -> str | None:
    """Agent allaqachon ishlayotganda koʻrsatiladi. Tanlangan amal nomini qaytaradi."""
    import tkinter as tk

    root = _root("PC Pulse", 400, 450 if can_update else 400)
    f = tk.Frame(root, bg=BG, padx=26, pady=22)
    f.pack(fill="both", expand=True)
    tk.Label(f, text="PC Pulse agent ishlayapti", bg=BG, fg=FG, font=(FONT, 15, "bold")).pack(anchor="w")
    tk.Label(f, text=f"{name or 'Kompyuter'}" + (f" · {username}" if username else ""), bg=BG, fg=MUTED, font=(FONT, 10)).pack(anchor="w", pady=(2, 16))
    choice = {"v": None}

    def pick(v):
        choice["v"] = v
        root.destroy()

    items = [("open", "Saytni ochish", True), ("restart", "Agentni qayta ishga tushirish", False),
             ("repair", "Qayta ulash (boshqa akkaunt)", False)]
    if can_update:
        items.append(("update", "Shu faylni oʻrnatish (yangilash)", False))
    items += [("remove", "Toʻxtatish va avtoyuklanishdan olib tashlash", False), (None, "Yopish", False)]
    for v, t, prim in items:
        _button(f, t, lambda v=v: pick(v), primary=prim).pack(fill="x", ipady=6, pady=4)
    root.mainloop()
    return choice["v"]


def busy_window(title: str, text: str, worker):
    """worker() ni fon oqimida bajaradi va tugaguncha kichik “kuting” oynasini koʻrsatadi. worker natijasini qaytaradi."""
    import tkinter as tk

    out: dict = {}

    def run():
        try:
            out["v"] = worker()
        except Exception as e:  # noqa: BLE001
            out["e"] = e

    th = threading.Thread(target=run, daemon=True)
    try:
        root = _root(title, 380, 150)
    except Exception:
        run()
        if "e" in out:
            raise out["e"]
        return out.get("v")
    root.protocol("WM_DELETE_WINDOW", lambda: None)  # yarim yoʻlda yopilmasin
    f = tk.Frame(root, bg=BG, padx=26, pady=24)
    f.pack(fill="both", expand=True)
    tk.Label(f, text=text, bg=BG, fg=FG, font=(FONT, 12, "bold"), justify="left").pack(anchor="w")
    dots = tk.Label(f, text="", bg=BG, fg=ACCENT, font=(FONT, 16, "bold"))
    dots.pack(anchor="w", pady=(10, 0))
    n = {"i": 0}

    def tick():
        if not th.is_alive():
            root.destroy()
            return
        n["i"] = (n["i"] + 1) % 4
        dots.config(text="●" * n["i"] + "○" * (3 - n["i"]))
        root.after(350, tick)

    th.start()
    root.after(100, tick)
    root.mainloop()
    th.join()
    if "e" in out:
        raise out["e"]
    return out.get("v")


def info(title: str, text: str) -> None:
    if sys.platform == "win32":
        import ctypes

        ctypes.windll.user32.MessageBoxW(None, text, title, 0x40 | 0x40000)
        return
    try:
        import tkinter as tk
        from tkinter import messagebox

        r = tk.Tk()
        r.withdraw()
        messagebox.showinfo(title, text)
        r.destroy()
    except Exception:
        print(f"{title}: {text}")


def ask(title: str, text: str) -> bool:
    if sys.platform == "win32":
        import ctypes

        return ctypes.windll.user32.MessageBoxW(None, text, title, 0x4 | 0x20 | 0x40000) == 6  # MB_YESNO | MB_ICONQUESTION
    try:
        import tkinter as tk
        from tkinter import messagebox

        r = tk.Tk()
        r.withdraw()
        v = messagebox.askyesno(title, text)
        r.destroy()
        return bool(v)
    except Exception:
        return False
