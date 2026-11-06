/** Deploy the escrow (contracts/src/HeadroomEscrow.sol, built by `cd contracts && forge build`) to Arc testnet
 *  and write ARC_ESCROW_ADDRESS + ARC_ESCROW_DEPLOY_BLOCK into .env. Constructor values: contracts/ESCROW-SPEC.md.
 *  Usage: cd signer && ./node_modules/.bin/tsx src/deploy-escrow.ts [--force] */
import fs from "node:fs";
import path from "node:path";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ESCROW, GAS, REPO_ROOT, explorerTx, publicClient, wallet } from "./escrow.js";

const FORWARDER = (process.env.CRE_FORWARDER_ADDRESS || "0x76c9cf548b4179F8901cda1f8623568b58215E62") as Hex;
if (ESCROW && !process.argv.includes("--force")) { console.error(`ARC_ESCROW_ADDRESS already set (${ESCROW}); pass --force to replace it`); process.exit(2); }
if (!process.env.ARC_OPERATOR_KEY || !process.env.RECEIPT_SIGNING_KEY) { console.error("need ARC_OPERATOR_KEY and RECEIPT_SIGNING_KEY"); process.exit(2); }
const art = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "contracts/out/HeadroomEscrow.sol/HeadroomEscrow.json"), "utf8"));
const op = wallet(process.env.ARC_OPERATOR_KEY);
const signer = privateKeyToAccount(process.env.RECEIPT_SIGNING_KEY as Hex).address;
const args = [op.account.address, signer, FORWARDER, 600n, 100_000n] as const;
const hash = await op.client.deployContract({ abi: art.abi, bytecode: art.bytecode.object as Hex, args, ...GAS });
const rcpt = await publicClient.waitForTransactionReceipt({ hash });
if (rcpt.status !== "success" || !rcpt.contractAddress) { console.error(`deploy failed: ${explorerTx(hash)}`); process.exit(1); }
const envPath = path.join(REPO_ROOT, ".env");
let text = fs.readFileSync(envPath, "utf8");
const set = (k: string, v: string) => { const re = new RegExp(`^${k}=[^\\s#]*`, "m"); text = re.test(text) ? text.replace(re, `${k}=${v}`) : `${text.trimEnd()}\n${k}=${v}\n`; };
set("ARC_ESCROW_ADDRESS", rcpt.contractAddress);
set("ARC_ESCROW_DEPLOY_BLOCK", String(rcpt.blockNumber));
fs.writeFileSync(envPath, text, { mode: 0o600 });
console.log(JSON.stringify({ address: rcpt.contractAddress, block: String(rcpt.blockNumber), tx: explorerTx(hash), constructor: args.map(String) }));
