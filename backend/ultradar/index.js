// index.js — Ultradar API (Node.js 20.x Lambda) — single route by weeknum

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
  try {
    // CORS preflight
    if (event.requestContext?.http?.method === "OPTIONS") {
      return { statusCode: 204, headers: CORS };
    }

    // Only one route: GET /by-week?weeknum=NNN
    const qp = event.queryStringParameters || {};
    const rawPath = (event.rawPath || event.path || "/").toLowerCase().replace(/\/+$/,"");
    if (!rawPath.endsWith("/by-week")) return json(404, { error: "Not found" });

    const { weeknum } = qp;
    if (!weeknum || !/^\d+$/.test(String(weeknum))) {
      return json(400, { error: "weeknum (ISO week number) is required as an integer" });
    }

    // Query the new gold table directly
    const sql = `
      SELECT
        store_name,
        marketplace_id,
        day_of_week,
        time_interval,
        pct_of_day
      FROM ${DB}.gold_daily_shape_by_day
      WHERE weeknum = CAST('${String(weeknum)}' AS integer)
      ORDER BY store_name, day_of_week, time_interval
    `;

    const rows = await runAthena(sql);

    const out = rows.map(r => ({
      store_name: r[0],
      marketplace_id: r[1] ? Number(r[1]) : null,
      day_of_week: r[2],
      time_interval: r[3],
      pct_of_day: r[4] ? Number(r[4]) : null
    }));

    return json(200, out);

  } catch (e) {
    console.error(e);
    return json(500, { error: String(e.message || e) });
  }
};

// ---------- helpers ---------------------------------------------------------

function json(code, body) {
  return { statusCode: code, headers: CORS, body: JSON.stringify(body) };
}

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
