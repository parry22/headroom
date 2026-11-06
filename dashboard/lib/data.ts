import { cache } from "react";
import { readBench } from "./bench";
import { readGateway } from "./gateway";
import { readLedger } from "./ledger";

/** Per-request memoised readers: the layout (gateway badge) and the page share one fetch. */
export const getBench = cache(() => readBench());
export const getLedger = cache(() => readLedger(50));
export const getGateway = cache(() => readGateway());
