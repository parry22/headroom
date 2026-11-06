/**
 * x402 v2 on Hedera, "upfront" payment flow: the facilitator settles BEFORE the handler runs,
 * so no token is generated or streamed before the USDC transfer has reached consensus (PRD 7.5).
 * Uses @x402/core's HTTP resource server directly (the stock Express middleware buffers the whole
 * response, which would defeat streaming).
 */
import type { Request } from "express";
import { HTTPFacilitatorClient, x402HTTPResourceServer, x402ResourceServer, type HTTPAdapter, type HTTPRequestContext, type RoutesConfig } from "@x402/core/server";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { caip2, cfg } from "./config.js";

export const CHAT_ROUTE = "POST /v1/chat/completions";

export class ExpressAdapter implements HTTPAdapter {
  /** Quote in micro-USDC, set by the handler before processHTTPRequest resolves the dynamic price. */
  quoteMicro = 0;
  constructor(private req: Request) {}
  getHeader(name: string) { const v = this.req.headers[name.toLowerCase()]; return Array.isArray(v) ? v[0] : v; }
  getMethod() { return this.req.method; }
  getPath() { return this.req.path; }
  getUrl() { return `${cfg.publicUrl}${this.req.originalUrl}`; }
  getAcceptHeader() { return this.req.headers.accept ?? ""; }
  getUserAgent() { return this.req.headers["user-agent"] ?? ""; }
}

export function buildX402() {
  const clients = [new HTTPFacilitatorClient({ url: cfg.facilitatorUrl })];
  if (cfg.fallbackFacilitatorUrl) clients.push(new HTTPFacilitatorClient({ url: cfg.fallbackFacilitatorUrl }));
  const resourceServer = new x402ResourceServer(clients).register(
    "hedera:*",
    new ExactHederaScheme({ defaultAssets: { [caip2]: { asset: cfg.hederaUsdcTokenId, decimals: 6 } } }),
  );
  const routes: RoutesConfig = {
    [CHAT_ROUTE]: {
      accepts: {
        scheme: "exact",
        network: caip2 as `${string}:${string}`,
        payTo: cfg.hederaOperatorId,
        // Dynamic price: exact micro-USDC quote computed by the handler from token counts.
        price: (ctx: HTTPRequestContext) => ({ amount: String((ctx.adapter as ExpressAdapter).quoteMicro), asset: cfg.hederaUsdcTokenId }),
        maxTimeoutSeconds: 60,
        extra: { paymentFlow: "upfront" },
      },
      description: "Headroom long-context inference, OpenAI-compatible chat completions, priced per request from token counts",
      mimeType: "application/json",
      serviceName: "headroom",
      tags: ["inference", "llm", "long-context", "agents"],
    },
  };
  const http = new x402HTTPResourceServer(resourceServer, routes);
  return { resourceServer, http };
}
export type X402 = ReturnType<typeof buildX402>;
