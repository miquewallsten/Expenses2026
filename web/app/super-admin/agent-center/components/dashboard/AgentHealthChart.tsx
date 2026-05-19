"use client";

import { useState, useEffect } from "react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from "recharts";

interface HealthDataPoint {
  time: string;
  healthy: number;
  degraded: number;
  offline: number;
}

export function AgentHealthChart({ data }: { data: HealthDataPoint[] }) {
  // Format time for display
  const formatTime = (timeStr: string) => {
    const date = new Date(timeStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Prepare chart data
  const chartData = data.map(point => ({
    ...point,
    time: formatTime(point.time)
  }));

  return (
    <div className="bg-surface-1 border border-subtle rounded-lg p-4">
      <h3 className="text-sm font-semibold text-primary mb-4">Agent Health Over Time</h3>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{
              top: 5,
              right: 30,
              left: 20,
              bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-subtle)" />
            <XAxis 
              dataKey="time" 
              stroke="var(--color-muted)"
              tick={{ fontSize: 12 }}
            />
            <YAxis 
              stroke="var(--color-muted)"
              tick={{ fontSize: 12 }}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: "var(--color-surface-1)",
                borderColor: "var(--color-subtle)",
                borderRadius: "6px",
              }}
              labelStyle={{ color: "var(--color-primary)" }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="healthy"
              stroke="var(--color-success)"
              activeDot={{ r: 8 }}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="degraded"
              stroke="var(--color-warning)"
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="offline"
              stroke="var(--color-error)"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}