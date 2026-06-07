import { createFileRoute } from "@tanstack/react-router";
import { TRACKER } from "@/lib/leadlogr-tracker";

export const Route = createFileRoute("/api/public/tracker/v1")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(TRACKER, {
          status: 200,
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "no-store, max-age=0",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
