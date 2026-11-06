# Architecture

One GPU node runs everything Headroom owns. Hedera, Arc and Chainlink are the only outside dependencies.

```mermaid
flowchart LR
  subgraph Buyers
    A[Buyer agent<br/>OpenAI SDK + x402 fetch] 
    T[Tab buyer<br/>session key]
  end
  subgraph Node[GPU node]
    G[x402 gateway<br/>quote, caps, meter, receipts]
    V[vLLM + LMCache MP<br/>FP8 KV in HBM]
    L1[(CPU DRAM L1)]
    L2[(NVMe L2)]
    S[Batch signer<br/>Merkle root]
    D[Dashboard]
    DB[(SQLite ledger)]
  end
  subgraph Hedera[Hedera testnet]
    F[Facilitator<br/>Blocky402]
    HTS[USDC via HTS]
    HCS[HCS audit topic]
  end
  subgraph Arc[Arc testnet]
    E[HeadroomEscrow<br/>built in Arc Studio]
  end
  subgraph CL[Chainlink]
    CRE[CRE workflow<br/>Vast/RunPod median]
  end
  A -- 1 request --> G
  G -- 2 402 + PAYMENT-REQUIRED --> A
  A -- 3 PAYMENT-SIGNATURE --> G
  G -- 4 verify + settle --> F --> HTS
  G -- 5 stream after settlement --> V
  V <--> L1 <--> L2
  G -- 6 record --> DB
  G -- 7 async --> HCS
  T -- EIP-712 tab request --> G
  DB --> S -- postBatch / release --> E
  T -- deposit / challenge --> E
  CRE -- setBaseline via forwarder --> E
  E -- baseline --> G
  DB --> D
```

Request flow (Mode A): payment settles on Hedera before the engine starts; `PAYMENT-RESPONSE` precedes the first token. Mode B: usage accrues on a tab, the signer posts a Merkle root every N requests or T minutes, the buyer can challenge any record inside the dispute window with a proof and the operator-signed receipt, and release pays the operator after the window.
