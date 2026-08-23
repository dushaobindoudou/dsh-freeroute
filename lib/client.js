/**
 * dsh-freeroute - web client entry.
 *
 * Registers a "免费模型" (Free Models) settings section through dsh's slot
 * system, so the plugin's UI lives inside the harness web settings next to
 * Models / General / Plugins. This file is the browser-side counterpart of
 * `lib/index.js` (the host entry); it runs in the web client fiber.
 *
 * Verified against the shipped dsh client surface (0.1.x):
 * - slot registration: `ctx.slots.inject("settings.section", () => ctx.slots.register({ name, id, order, label, inject }, Component))`
 *   (same pattern as @deepseek-ai/dsh-client-ui-settings-models).
 * - settings read: `api.settings.describe({})` -> `{ result: { value: { writable, namespaces: [{ ns, value, revision }] } } }`.
 * - settings write: `api.settings.mutate({ ns, ops: [{ op: "set", path: [], value }] })`.
 * - locale: `ctx.locale.register(ns, { zh, en })` + `ctx.locale.bind(ns)`.
 * - ranking is shared with the host via `rankFreeModels` from `./index.js`.
 *
 * Integration note: dsh's web frontend is a pre-built Vite bundle. To surface
 * this section in `dsh web`, dsh-freeroute must be added to the dsh-web-frontend
 * client bundle and the frontend rebuilt; `free-models-preview.html` mirrors
 * the panel standalone for iteration without that rebuild.
 */
import React from "react";

import { FREEROUTE_VERSION, rankFreeModels } from "./index.js";

const NS = "freeroute.free-models";
const PROVIDER = "openrouter";
const CATALOG_URL = "https://openrouter.ai/api/v1/models";
const DEFAULT_NS = "agent-default-model";

const zh = {
  nav: "免费模型",
  title: "免费模型",
  subtitle: "OpenRouter 免费额度模型排行，一键设为默认；限流自动轮转。",
  refresh: "刷新目录",
  empty: "免费目录为空",
  loading: "正在拉取 OpenRouter 免费目录…",
  ctx: "上下文",
  use: "使用",
  applied: "已设为默认模型",
  applyFailed: "设置写入失败",
  current: "当前默认",
  hint: "会话内立即接管: /free on · 查看排行与冷却: /free status",
};
const en = {
  nav: "Free Models",
  title: "Free Models",
  subtitle: "Ranked OpenRouter free-tier models, one click to default; auto-rotate on rate limits.",
  refresh: "Refresh catalog",
  empty: "Free catalog is empty",
  loading: "Fetching OpenRouter free catalog…",
  ctx: "context",
  use: "Use",
  applied: "Set as default model",
  applyFailed: "Failed to write setting",
  current: "Current default",
  hint: "Take over this session: /free on · ranking & cooldowns: /free status",
};

function fmtCtx(n) {
  if (!n) return "?";
  if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + "M";
  if (n >= 1000) return Math.round(n / 1000) + "k";
  return String(n);
}

async function fetchRankedCatalog() {
  const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const body = await res.json();
  return rankFreeModels(body.data, {});
}

async function readDefaultModel(api) {
  const described = await api.settings.describe({});
  if (!described || !described.result || !described.result.ok) return undefined;
  const view = (described.result.value.namespaces || []).find((v) => v && v.ns === DEFAULT_NS);
  const value = view && view.value;
  if (value && typeof value.provider === "string" && typeof value.model === "string") return value;
  return undefined;
}

function FreeModelsPanel(props) {
  const { api, t } = props;
  const [catalog, setCatalog] = React.useState([]);
  const [error, setError] = React.useState("");
  const [status, setStatus] = React.useState(t("loading"));
  const [busyId, setBusyId] = React.useState(null);
  const [current, setCurrent] = React.useState(null);

  const load = React.useCallback(async () => {
    setStatus(t("loading"));
    setError("");
    try {
      const [list, def] = await Promise.all([
        fetchRankedCatalog(),
        readDefaultModel(api).catch(() => undefined),
      ]);
      setCatalog(list);
      setCurrent(def || null);
      setStatus(list.length === 0 ? t("empty") : t("empty") + " · " + list.length);
    } catch (e) {
      setError(String((e && e.message) || e));
      setStatus(t("empty"));
    }
  }, [api, t]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleUse = React.useCallback(
    async (model) => {
      setBusyId(model.id);
      try {
        const res = await api.settings.mutate({
          ns: DEFAULT_NS,
          ops: [{ op: "set", path: [], value: { provider: PROVIDER, model: model.id } }],
        });
        if (res && res.result && res.result.ok) {
          setCurrent({ provider: PROVIDER, model: model.id });
          setStatus(t("applied") + ": " + model.id);
        } else {
          const message = res && res.result && res.result.error ? res.result.error.message : "";
          setStatus(t("applyFailed") + (message ? ": " + message : ""));
        }
      } catch (e) {
        setStatus(t("applyFailed") + ": " + String((e && e.message) || e));
      } finally {
        setBusyId(null);
      }
    },
    [api, t],
  );

  const h = React.createElement;

  return h(
    "div",
    { style: { padding: "18px 22px" } },
    h(
      "div",
      { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 } },
      h(
        "div",
        null,
        h("h1", { style: { margin: 0, fontSize: 18 } }, t("title")),
        h("p", { style: { margin: "4px 0 0", color: "#9aa4b2", fontSize: 12.5 } }, t("subtitle") + " · v" + FREEROUTE_VERSION),
        current
          ? h("p", { style: { margin: "6px 0 0", color: "#34d399", fontSize: 12.5 } },
              t("current") + ": " + current.provider + " / " + current.model)
          : null,
      ),
      h("button", { onClick: load, style: btnStyle(false) }, t("refresh")),
    ),
    error ? h("div", { style: { color: "#f5b14c", fontSize: 12, marginBottom: 8 } }, "刷新失败: " + error) : null,
    catalog.length === 0
      ? h("div", { style: { color: "#6b7585", padding: 24, textAlign: "center" } }, status)
      : h(
          "div",
          null,
          catalog.map((m, i) =>
            h(
              "div",
              {
                key: m.id,
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 12px",
                  border: "1px solid #222831",
                  borderRadius: 9,
                  marginTop: 8,
                  background: "#1a1f26",
                },
              },
              h(
                "div",
                { style: { flex: 1, minWidth: 0 } },
                h(
                  "div",
                  { style: { fontWeight: 600, fontSize: 13.5, display: "flex", alignItems: "center", gap: 8 } },
                  (i + 1) + ". " + m.name,
                  current && current.model === m.id
                    ? h("span", { style: badgeStyle("#34d399") }, "✓ " + t("current"))
                    : null,
                ),
                h("div", { style: { color: "#6b7585", fontSize: 12, fontFamily: "ui-monospace, monospace", marginTop: 2 } }, m.id),
                h(
                  "div",
                  { style: { marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" } },
                  h("span", { style: badgeStyle("#34d399") }, "score " + m.score),
                  h("span", { style: badgeStyle("#9aa4b2") }, t("ctx") + " " + fmtCtx(m.ctx)),
                  m.flags.length > 0 ? h("span", { style: badgeStyle("#6b7585") }, m.flags.join(" · ")) : null,
                ),
              ),
              h(
                "button",
                { onClick: () => handleUse(m), disabled: busyId === m.id, style: btnStyle(true) },
                busyId === m.id ? "…" : t("use"),
              ),
            ),
          ),
        ),
    h("p", { style: { margin: "14px 0 0", color: "#6b7585", fontSize: 12 } }, t("hint")),
  );
}

function btnStyle(primary) {
  return {
    background: primary ? "#34d399" : "#1a1f26",
    color: primary ? "#06281f" : "#e6e9ee",
    border: "1px solid " + (primary ? "#34d399" : "#2a313b"),
    borderRadius: 8,
    padding: "7px 12px",
    fontSize: 13,
    cursor: "pointer",
    fontWeight: primary ? 600 : 400,
  };
}
function badgeStyle(color) {
  return {
    fontSize: 11,
    padding: "2px 7px",
    borderRadius: 999,
    border: "1px solid " + color,
    color: color,
    background: "rgba(255,255,255,0.02)",
  };
}

/** Required client services (cordis fiber inject). */
const inject = ["slots", "locale", "connection", "remote"];

function apply(ctx) {
  ctx.effect(() => {
    ctx.locale.register(NS, { zh, en });
  }, "freeroute: copy dictionaries");
  ctx.effect(() => {
    const connection = ctx.get("connection");
    const t = ctx.locale.bind(NS);
    const injected = () => ({ api: connection.api, t });
    ctx.slots.inject("settings.section", () =>
      ctx.slots.register(
        {
          name: "settings.section",
          id: "freeroute",
          order: 60,
          label: () => t("nav"),
          inject: injected,
        },
        FreeModelsPanel,
      ),
    );
  }, "freeroute: register free-models settings section");
}

export { apply, inject };
