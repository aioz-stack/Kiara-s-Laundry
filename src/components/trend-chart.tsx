"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { bucketLabel, type Granularity } from "@/lib/dates";
import { centsToDecimal, formatMoney } from "@/lib/money";

export type TrendRow = {
  key: string;
  salesCents: number;
  collectedCents: number;
};

const SERIES = [
  { key: "salesCents", label: "Gross sales", color: "var(--chart-sales)" },
  { key: "collectedCents", label: "Collected", color: "var(--chart-collected)" },
] as const;

function compactMoney(cents: number) {
  const pesos = Math.round(cents / 100);
  if (Math.abs(pesos) >= 1000) return `${Math.round(pesos / 100) / 10}k`;
  return String(pesos);
}

/**
 * Income only. Expenses are left out because one rent or utility day dwarfs daily
 * sales on a shared axis; they are reported as figures and by category instead.
 */
export function TrendChart({
  rows,
  granularity,
  currency,
}: {
  rows: TrendRow[];
  granularity: Granularity;
  currency: string;
}) {
  const data = rows.map((row) => ({ ...row, label: bucketLabel(row.key, granularity) }));

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {SERIES.map((item) => (
          <li key={item.key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-0.5 w-4 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </li>
        ))}
      </ul>
      <div className="h-64 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={compactMoney}
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            />
            <Tooltip
              cursor={{ stroke: "var(--input)" }}
              formatter={(value, name) => [formatMoney(Number(value), currency), name]}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                fontSize: 12,
              }}
            />
            {SERIES.map((item) => (
              <Line
                key={item.key}
                dataKey={item.key}
                name={item.label}
                stroke={item.color}
                strokeWidth={2}
                dot={rows.length <= 14 ? { r: 3, strokeWidth: 0, fill: item.color } : false}
                activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted-foreground">View as table</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="tabular w-full text-right text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th scope="col" className="p-1.5 text-left font-medium">
                  Period
                </th>
                {SERIES.map((item) => (
                  <th key={item.key} scope="col" className="p-1.5 font-medium">
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.key} className="border-b last:border-0">
                  <th scope="row" className="p-1.5 text-left font-normal">
                    {row.label}
                  </th>
                  {SERIES.map((item) => (
                    <td key={item.key} className="p-1.5">
                      {centsToDecimal(row[item.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
