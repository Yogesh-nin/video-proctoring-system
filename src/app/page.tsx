'use client';

import React, { useState, useCallback } from 'react';
import VideoFeed from './components/VideoFeed';
import EventLog from './components/EventLog';

export default function Home() {
  const [events, setEvents] = useState<{ time: string; message: string }[]>([]);

  const handleEvent = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    setEvents((prev) => [...prev, { time, message: msg }]);

    // Optionally log to API
    // fetch('/api/log-event', {
    //   method: 'POST',
    //   body: JSON.stringify({ message: msg, time }),
    // });
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">🎥 AI Proctoring System</h1>
      <button onClick={()=> setEvents([])}>Clear logs</button>
      <VideoFeed onEvent={handleEvent} />
      <EventLog events={events} />
    </main>
  );
}
