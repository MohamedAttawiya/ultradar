// index.js — Ultradar API (Node.js 20.x Lambda)

const {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand
} = require("@aws-sdk/client-athena");

const REGION = process.env.AWS_REGION || "eu-central-1";
const DB     = process.env.DB_NAME    || "store_shapes_mvp3";
const OUTPUT = process.env.ATHENA_OUTPUT || "s3://ds-store-shapes-mvp3/athena_results/";

const athena = new AthenaClient({ region: REGION });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Content-Type": "application/json"
};

exports.handler = async (event) => {
  const rawPath = (event.rawPath || event.path || "/").toLowerCase();
  const path = rawPath.replace(/\/+$/,""); // trim trailing slash
  const qp = event.queryStringParameters || {};

  try {
    // Pre-flight CORS
    if (event.requestContext?.http?.method === "OPTIONS") {
      return { statusCode: 204, headers: CORS };
    }

    // --- /stores -----------------------------------------------------------
    if (path.endsWith("/stores")) {
      const rows = await runAthena(`
        SELECT DISTINCT store_name
        FROM ${DB}.v_gold_daily_shape_by_day
        ORDER BY store_name
      `);
      return json(200, rows.map(r => r[0]).filter(Boolean));
    }

    // --- /slot-of-day?store=..&day=YYYY-MM-DD ------------------------------
    if (path.endsWith("/slot-of-day")) {
      const { store, day } = qp;
      if (!store || !day) return bad("store and day required");
      if (!isISODate(day)) return bad("day must be YYYY-MM-DD");

      const safeStore = String(store).replace(/'/g, "''");
      const sql = `
        SELECT
          time_interval,
          start_minute,
          orders,
          daily_orders,
          pct_of_day,
          cum_pct,
          store_name,
          CAST(order_day AS VARCHAR) AS order_day,
          weeknum,
          month,
          day_of_week
        FROM ${DB}.v_gold_daily_shape_by_day
        WHERE order_day = DATE '${day}'
          AND store_name = '${safeStore}'
        ORDER BY start_minute
      `;
      const rows = await runAthena(sql);
      const out = rows.map(r => ({
        time_interval: r[0],
        start_minute: Number(r[1]),
        orders: Number(r[2]),
        daily_orders: Number(r[3]),
        pct_of_day: Number(r[4]),
        cum_pct: Number(r[5]),
        store_name: r[6],
        order_day: r[7],
        weeknum: Number(r[8]),
        month: Number(r[9]),
        day_of_week: r[10]
      }));
      return json(200, out);
    }

    // --- /curves-by-day?day=YYYY-MM-DD ------------------------------------
    if (path.endsWith("/curves-by-day")) {
      const { day } = qp;
      if (!day) return bad("day required");
      if (!isISODate(day)) return bad("day must be YYYY-MM-DD");

      const sql = `
        SELECT store_name, time_interval, start_minute, pct_of_day
        FROM ${DB}.v_gold_daily_shape_by_day
        WHERE order_day = DATE '${day}'
        ORDER BY start_minute, store_name
      `;
      const rows = await runAthena(sql);
      // rows: [store_name, time_interval, start_minute, pct_of_day]

      // Build labels from unique start_minute order (48 points)
      const labels = [];
      let lastSM = null;
      for (const r of rows) {
        const sm = Number(r[2]);
        if (sm !== lastSM) {
          labels.push(r[1]); // time_interval
          lastSM = sm;
        }
      }

      // Group series by store
      const seriesByStore = new Map();
      for (const r of rows) {
        const store = r[0];
        const pct   = Number(r[3]) * 100; // y-axis in %
        if (!seriesByStore.has(store)) seriesByStore.set(store, []);
        seriesByStore.get(store).push(pct);
      }

      const datasets = [...seriesByStore.entries()].map(([label, data]) => ({ label, data }));
      return json(200, { labels, datasets });
    }

    // Health (optional)
    if (path.endsWith("/health")) {
      return json(200, { ok: true, region: REGION, db: DB });
    }

    return json(404, { error: "Not found" });
  } catch (e) {
    console.error(e);
    return json(500, { error: String(e.message || e) });
  }
};

// ---------- helpers ---------------------------------------------------------

function isISODate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s); }

function json(code, body) {
  return { statusCode: code, headers: CORS, body: JSON.stringify(body) };
}

function bad(msg) { return json(400, { error: msg }); }

async function runAthena(sql) {
  const { QueryExecutionId: id } = await athena.send(new StartQueryExecutionCommand({
    QueryString: sql,
    QueryExecutionContext: { Database: DB },
    ResultConfiguration: { OutputLocation: OUTPUT }
  }));

  for (;;) {
    const q = await athena.send(new GetQueryExecutionCommand({ QueryExecutionId: id }));
    const s = q.QueryExecution.Status.State;
    if (s === "SUCCEEDED") break;
    if (s === "FAILED" || s === "CANCELLED") {
      throw new Error(`${s}: ${q.QueryExecution.Status.StateChangeReason}`);
    }
    await new Promise(r => setTimeout(r, 600));
  }

  const res = await athena.send(new GetQueryResultsCommand({ QueryExecutionId: id, MaxResults: 1000 }));
  const rows = res.ResultSet?.Rows || [];
  if (!rows.length) return [];
  return rows.slice(1).map(r => r.Data.map(c => c?.VarCharValue ?? null)); // drop header
}
