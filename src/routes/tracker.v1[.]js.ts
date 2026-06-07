import { createFileRoute } from "@tanstack/react-router";
import { TRACKER } from "@/lib/leadlogr-tracker";

export const Route = createFileRoute("/tracker/v1.js")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(TRACKER, {
          status: 200,
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
