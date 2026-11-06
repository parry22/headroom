/** One-time: create an HCS topic with the operator account. Prints the topic id for .env (HCS_TOPIC_ID, or HCS_BASELINE_TOPIC_ID with memo "headroom CRE price baseline").
 *  Usage: tsx scripts/hcs-create-topic.ts [memo] */
import { AccountId, Client, PrivateKey, TopicCreateTransaction } from "@hiero-ledger/sdk";
import { cfg } from "../src/config.js";

const client = (cfg.hederaNetwork === "mainnet" ? Client.forMainnet() : Client.forTestnet())
  .setOperator(AccountId.fromString(cfg.hederaOperatorId), PrivateKey.fromStringECDSA(cfg.hederaOperatorKey));
const resp = await new TopicCreateTransaction().setTopicMemo(process.argv[2] ?? "headroom paid-request audit log").execute(client);
const receipt = await resp.getReceipt(client);
console.log(`HCS_TOPIC_ID=${receipt.topicId?.toString()}`);
console.log(`https://hashscan.io/${cfg.hederaNetwork}/topic/${receipt.topicId?.toString()}`);
client.close();
