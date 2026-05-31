// This API route is intentionally disabled to avoid using workspace packages
// and to ensure the server is the single source of truth for Aavegotchi data.
export async function GET() {
  return new Response('Use the app server /api/aavegotchis endpoint', {
    status: 404,
  });
}
