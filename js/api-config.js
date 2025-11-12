(function (global) {
  const DEFAULT_BASE = "https://zp97gyooxk.execute-api.eu-central-1.amazonaws.com";

  const sanitizeBase = (value) => String(value || "").trim().replace(/\/+$/, "");

  const base = sanitizeBase(
    typeof global.ULTRADAR_API_BASE === "string" && global.ULTRADAR_API_BASE.trim()
      ? global.ULTRADAR_API_BASE
      : DEFAULT_BASE
  );

  function buildUrl(path = "", params = {}) {
    const normalizedPath = String(path || "").replace(/^\//, "");
    const url = new URL(normalizedPath, base + "/");
    Object.entries(params).forEach(([key, value]) => {
      if (value == null || value === "") return;
      url.searchParams.set(key, value);
    });
    return url.toString();
  }

  const helpers = {
    strategies: () => buildUrl("/strategies"),
    strategiesList: (prefix = "strategies/") =>
      buildUrl("/strategies", prefix ? { prefix } : {}),
    strategy: (key) => buildUrl("/strategy", key ? { key } : {}),
    exclusions: () => buildUrl("/exclusions"),
    exclusionsList: (prefix = "exclusions/") =>
      buildUrl("/exclusions", prefix ? { prefix } : {}),
    curvesByDay: (day) => buildUrl("/curves-by-day", day ? { day } : {}),
    slotCurvesByWeek: (weeknum) => buildUrl("/by-week", weeknum ? { weeknum } : {}),
    orderForecast: () => buildUrl("/order-forecast"),
  };

  const api = {
    base,
    buildUrl,
    endpoint(name, ...args) {
      if (!name) {
        throw new Error("Ultradar API endpoint name is required.");
      }
      const helper = helpers[name];
      if (!helper) {
        throw new Error(`Unknown Ultradar API endpoint: ${name}`);
      }
      return helper(...args);
    },
    endpoints: Object.freeze({
      strategies: () => helpers.strategies(),
      strategiesList: (prefix) => helpers.strategiesList(prefix),
      strategy: (key) => helpers.strategy(key),
      exclusions: () => helpers.exclusions(),
      exclusionsList: (prefix) => helpers.exclusionsList(prefix),
      curvesByDay: (day) => helpers.curvesByDay(day),
      slotCurvesByWeek: (weeknum) => helpers.slotCurvesByWeek(weeknum),
      orderForecast: () => helpers.orderForecast(),
    }),
  };

  global.ULTRADAR_API_BASE = base;
  global.UltradarApi = Object.freeze(api);
})(typeof window !== "undefined" ? window : globalThis);
