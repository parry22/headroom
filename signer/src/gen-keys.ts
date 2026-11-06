/** Fill empty EVM key slots in .env with fresh testnet keys and print only the public addresses.
 *  Never overwrites a filled value and never prints a private key.
 *  Usage: pnpm -s exec tsx src/gen-keys.ts            (fills RECEIPT_SIGNING_KEY, ARC_OPERATOR_KEY, BUYER_ARC_KEY)
 *         pnpm -s exec tsx src/gen-keys.ts --addresses (prints addresses for whatever is filled, changes nothing) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const envPath = path.join(root, ".env");
const SLOTS = [
  { key: "RECEIPT_SIGNING_KEY", use: "Studio constructor arg `receiptSigner`; no funds needed" },
  { key: "ARC_OPERATOR_KEY", use: "Studio constructor arg `operator`; fund with Arc testnet USDC (posts batches, bond)" },
  { key: "BUYER_ARC_KEY", use: "demo tab buyer; fund with Arc testnet USDC (deposit + gas)" },
];
const readOnly = process.argv.includes("--addresses");
let text = fs.readFileSync(envPath, "utf8");
const valueOf = (k: string) => text.match(new RegExp(`^${k}=([^\\s#]*)`, "m"))?.[1] ?? "";

for (const { key, use } of SLOTS) {
  let v = valueOf(key);
  let created = false;
  if (!v && !readOnly) {
    v = generatePrivateKey();
    const line = new RegExp(`^${key}=[^\\s#]*`, "m");
    text = line.test(text) ? text.replace(line, `${key}=${v}`) : `${text.trimEnd()}\n${key}=${v}\n`;
    created = true;
  }
  if (!v) { console.log(`${key.padEnd(20)} (empty)`); continue; }
  console.log(`${key.padEnd(20)} ${privateKeyToAccount(v as Hex).address}  ${created ? "[new]" : "[existing]"}  ${use}`);
}
if (!readOnly) fs.writeFileSync(envPath, text, { mode: 0o600 });
