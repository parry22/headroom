/** Associate testnet USDC (0.0.429274) with a Hedera account so it can receive payments. tsx scripts/associate-usdc.ts <accountId> <ecdsaKeyHex> */
import { AccountId, Client, PrivateKey, TokenAssociateTransaction, TokenId } from "@hiero-ledger/sdk";
const [id, key] = process.argv.slice(2);
if (!id || !key) { console.error("usage: associate-usdc.ts <accountId> <ecdsaKeyHex>"); process.exit(2); }
const client = Client.forTestnet().setOperator(AccountId.fromString(id), PrivateKey.fromStringECDSA(key));
const r = await new TokenAssociateTransaction().setAccountId(AccountId.fromString(id)).setTokenIds([TokenId.fromString(process.env.HEDERA_USDC_TOKEN_ID ?? "0.0.429274")]).execute(client);
console.log("status:", (await r.getReceipt(client)).status.toString(), "tx:", r.transactionId.toString());
client.close();
