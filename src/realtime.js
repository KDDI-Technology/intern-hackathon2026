export function createRealtimeChannel(channel) {
  const source = new EventSource(`/realtime/events?channel=${encodeURIComponent(channel)}`);

  const api = {
    onmessage: null,
    onopen: null,
    onclose: null,
    onerror: null,
    postMessage(payload) {
      fetch("/realtime/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, payload }),
      }).catch((error) => console.error("Realtime send failed", error));
    },
    close() {
      source.close();
      api.onclose?.();
    },
  };

  source.addEventListener("open", () => api.onopen?.());
  source.addEventListener("message", (event) => {
    try {
      api.onmessage?.({ data: JSON.parse(event.data) });
    } catch (error) {
      console.error("Realtime message parse failed", error);
    }
  });
  source.addEventListener("error", (event) => api.onerror?.(event));

  return api;
}
