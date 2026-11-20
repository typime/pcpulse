// Umumiy holat. Eski ilovadagi S obyekti va render() modeli saqlangan: amallar S ni oʻzgartiradi va render() chaqiradi,
// React esa render() dan keyin bitta qayta chizishni bajaradi (bir nechta chaqiruv birlashtiriladi).
import { useSyncExternalStore } from "react";
import { todayIso } from "./format";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Json = any;

export type ModalState =
  | { kind: "confirm"; title: string; text: string; okText: string; danger: boolean; onOk: () => void }
  | { kind: "prompt"; title: string; value: string; onSubmit: (v: string) => void }
  | { kind: "image" }
  | { kind: "sensors" };

export type Toast = { id: string; text: string; kind: "" | "ok" | "err" };
export type PowerKind = "wake" | "shutdown" | "restart" | "sleep" | "hibernate" | "logoff";
export type PowerMark = { kind: PowerKind; at: number; via?: string[] };

export type Route = "overview" | "system" | "procs" | "time" | "control" | "settings";

export interface State {
  power: Record<string, PowerMark>;
  token: string;
  user: Json | null;
  devices: Json[];
  devId: string;
  dev: Json | null;
  live: Json | null; health: Json | null; sysinfo: Json | null; online: boolean; lastSeen: number;
  hist: { t: number[]; cpu: number[]; gpu: number[]; ram: number[]; cpuT: number[]; gpuT: number[] };
  route: Route;
  sub: { system: string; procs: string; hist: number; metric: string };
  usage: { day: string; data: Json | null; history: Json | null };
  metrics: Json | null; metricsAt: number;
  events: Json[]; eventsAt: number;
  startup: Json[] | null; cleanup: Json | null; cleanupResult: Json | null;
  screenshot: { url: string; ts: number } | null; sensorsRaw: Json | null;
  busy: Record<string, boolean>;
  form: { msg: string; timerMin: number | string; timerAct: string; authMode: "login" | "register"; authErr: string; fanDraft: Record<string, number> };
  modal: ModalState | null;
  toasts: Toast[];
  push: { state: "unknown" | "on" | "off" | "denied" | "unsupported" | "insecure" };
  installPrompt: Json | null;
  bootErr: string;
  pollTimer: ReturnType<typeof setTimeout> | null;
  liveGen: number;
  navTick: number;  // har marshrut almashganda oshadi — sahifaga kirish animatsiyasi uchun
}

function ls(k: string): string { try { return localStorage.getItem(k) || ""; } catch { return ""; } }

export const S: State = {
  power: {},
  token: ls("pcp_token"),
  user: null,
  devices: [],
  devId: ls("pcp_dev"),
  dev: null,
  live: null, health: null, sysinfo: null, online: false, lastSeen: 0,
  hist: { t: [], cpu: [], gpu: [], ram: [], cpuT: [], gpuT: [] },
  route: "overview",
  sub: { system: "comp", procs: "mem", hist: 14, metric: "cpu_temp" },
  usage: { day: todayIso(), data: null, history: null },
  metrics: null, metricsAt: 0,
  events: [], eventsAt: 0,
  startup: null, cleanup: null, cleanupResult: null, screenshot: null, sensorsRaw: null,
  busy: {}, form: { msg: "", timerMin: 30, timerAct: "shutdown", authMode: "login", authErr: "", fanDraft: {} },
  modal: null, toasts: [],
  push: { state: "unknown" },
  installPrompt: null,
  bootErr: "",
  pollTimer: null,
  liveGen: 0,
  navTick: 0,
};

let version = 0;
let pending = false;
const listeners = new Set<() => void>();

/** Holat oʻzgardi — React bir marta qayta chizadi */
export function render(): void {
  version++;
  if (pending) return;
  pending = true;
  queueMicrotask(() => { pending = false; listeners.forEach((l) => l()); });
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useStore(): number { return useSyncExternalStore(subscribe, () => version, () => version); }

export const device = () => S.devices.find((x) => x.id === S.devId) || null;
