'use client';
import React from 'react';

export default function EventLog({ events }: { events: { time: string; message: string }[] }) {
  return (
    <div className="bg-gray-900 text-gray-100 rounded-lg p-4 mt-4 w-full max-w-xl mx-auto">
      <h2 className="text-lg font-semibold mb-2">Event Logs</h2>
      <ul className="max-h-64 overflow-y-auto space-y-1 text-sm">
        {events.map((e, i) => (
          <li key={i}>
            <span className="text-green-400">[{e.time}]</span> {e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
