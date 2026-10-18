import { readOddsConnectorStatus } from "@/connectors/registry";
import { readState } from "@/server/service";
import { apiError, guard, workspaceOf } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  try {
    const workspace = workspaceOf(
      new URL(request.url).searchParams.get("workspace") || "personal",
    );
    const state = await readState(workspace);
    const oddsApi = readOddsConnectorStatus(state, {
      apiKeyConfigured: Boolean(process.env.ODDS_API_KEY?.trim()),
    });

    return Response.json(
      { oddsApi },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
