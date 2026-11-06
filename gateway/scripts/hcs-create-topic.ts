/** One-time: create the HCS audit topic with the operator account. Prints the topic id to put in .env as HCS_TOPIC_ID. */
import { AccountId, Client, PrivateKey, TopicCreateTransaction } from "@hiero-ledger/sdk";
import { cfg } from "../src/config.js";

const client = (cfg.hederaNetwork === "mainnet" ? Client.forMainnet() : Client.forTestnet())
  .setOperator(AccountId.fromString(cfg.hederaOperatorId), PrivateKey.fromStringECDSA(cfg.hederaOperatorKey));
const resp = await new TopicCreateTransaction().setTopicMemo("headroom paid-request audit log").execute(client);
const receipt = await resp.getReceipt(client);
console.log(`HCS_TOPIC_ID=${receipt.topicId?.toString()}`);
console.log(`https://hashscan.io/${cfg.hederaNetwork}/topic/${receipt.topicId?.toString()}`);
client.close();
