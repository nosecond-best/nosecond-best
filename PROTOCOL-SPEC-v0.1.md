# NoSecond.Best Protocol Specification v0.1

**DRAFT — 2026-02-17**
**Author:** SatoshiSan

---

## 1. Overview

NoSecond.Best (NSB) is a decentralized naming protocol anchored on the Bitcoin timechain, providing human-readable payment addresses that work today via DNS and evolve toward full decentralization.

### Vision

| Phase | Format | Resolution | Trust Model |
|-------|--------|-----------|-------------|
| 1 — Gateway | `₿alice@nosecond.best` | DNS (BIP-353) + HTTPS gateway | Centralized (our server) |
| 2 — Federated | `₿alice@anydomain.com` | Any domain runs a resolver | Federated (domain operators) |
| 3 — Sovereign | `₿alice` (no domain) | On-chain + Nostr relays | Trustless (Bitcoin + cryptography) |

---

## 2. Prior Art & Positioning

### BIP-353 (DNS Payment Instructions)
- **Status:** Complete (2024)
- **Format:** `₿user@domain` (display), resolved via DNS TXT records at `user.user._bitcoin-payment.domain`
- **Requires:** DNSSEC, domain ownership
- **Key detail:** BIP-353 already defines ₿ as the display prefix for human-readable Bitcoin payment names

### What BIP-353 doesn't do:
- No decentralized name ownership — names are controlled by whoever controls the domain's DNS
- No on-chain registration — no proof of ownership on Bitcoin
- No marketplace for names — no buying/selling/transferring names
- No path to domain-free resolution

### NSB's value add:
NSB **builds on** BIP-353 for Phase 1 compatibility, then **extends beyond it** by anchoring name ownership on-chain and enabling decentralized resolution.

---

## 3. Architecture

### 3.1 Name Format

```
₿<name>@<domain>       # Phase 1 & 2 (BIP-353 compatible)
₿<name>                 # Phase 3 (domain-free, on-chain only)
```

**Name rules:**
- Lowercase alphanumeric + hyphens + underscores
- 1-64 characters
- No leading/trailing hyphens
- Reserved names (see §7) controlled by NSB initially

### 3.2 Ownership Model

Every name is bound to a **secp256k1 keypair** (compatible with both Bitcoin and Nostr).

- The **public key** is the owner identity
- The **private key** is used to sign registration, updates, and transfers
- Users can use their existing Nostr key (npub/nsec) — no new key infrastructure needed

### 3.3 Registration (On-Chain Anchoring)

#### What goes on-chain

Name registrations are batched and anchored to Bitcoin L1 using an **OP_RETURN merkle commitment**:

```
OP_RETURN <NSB_PROTOCOL_TAG> <merkle_root> <block_height> <batch_number>
```

Where:
- `NSB_PROTOCOL_TAG` = `0x4e534200` ("NSB\0")
- `merkle_root` = root of a merkle tree containing all registrations in this batch
- `block_height` = reference block height
- `batch_number` = sequential batch counter

#### What's in the merkle tree

Each leaf is the SHA256 hash of a registration record:

```json
{
  "name": "alice",
  "domain": "nosecond.best",
  "owner_pubkey": "02abc123...",
  "registered_at": 880000,
  "expires_at": 932000,
  "nonce": "random_bytes_hex"
}
```

#### Batch frequency

- Registrations are batched every ~6 blocks (~1 hour)
- During low-activity periods, batches may be less frequent
- Each registration gets a **merkle proof** that can be verified against the on-chain root

#### Cost structure

- One on-chain transaction per batch, regardless of number of registrations
- At ~250 bytes per tx, cost is shared across all registrations in the batch
- Individual registration cost: Lightning payment to NSB service

### 3.4 Resolution (How Names Resolve to Addresses)

Resolution data is **NOT** stored on-chain (it changes too often). Instead, it lives on **Nostr relays** and is served by the **NSB gateway**.

#### Layer 1: Nostr Events (Source of Truth)

Name owners publish resolution data as signed Nostr events:

```json
{
  "kind": 38383,
  "tags": [
    ["d", "alice@nosecond.best"],
    ["onchain", "bc1qxyz..."],
    ["lightning", "lno1qgsq..."],
    ["lnurl", "lnurl1dp68gurn8ghj7..."],
    ["bolt12", "lno1..."],
    ["nostr", "npub1abc..."],
    ["silent", "sp1q..."],
    ["updated", "1708200000"]
  ],
  "content": "",
  "pubkey": "<owner_pubkey_hex>",
  "created_at": 1708200000,
  "id": "...",
  "sig": "..."
}
```

**Event kind 38383** (parameterized replaceable event):
- `d` tag = name identifier (ensures only one active record per name)
- Payment method tags = what this name resolves to
- Signed by the owner key = verifiable by anyone
- Replaceable = owner publishes new event to update

**Supported resolution targets:**
| Tag | Description |
|-----|-------------|
| `onchain` | On-chain Bitcoin address (bc1...) |
| `lightning` | Lightning node pubkey or connection string |
| `lnurl` | LNURL pay endpoint |
| `bolt12` | BOLT12 offer |
| `silent` | BIP-352 silent payment address |
| `nostr` | Nostr public key |
| `web` | Website URL |

#### Layer 2: NSB Gateway (BIP-353 Bridge)

The nosecond.best gateway reads Nostr events and serves them via standard protocols:

**DNS (BIP-353 compatible):**
```
alice.user._bitcoin-payment.nosecond.best. IN TXT "bitcoin:bc1qxyz...?lno=lno1..."
```

**HTTPS (Lightning Address / LNURL compatible):**
```
GET https://nosecond.best/.well-known/lnurlp/alice
→ { "callback": "...", "tag": "payRequest", ... }
```

**API (for apps):**
```
GET https://nosecond.best/api/v1/resolve/alice
→ {
    "name": "alice",
    "owner": "02abc123...",
    "onchain": "bc1qxyz...",
    "lightning": "...",
    "verified": true,
    "merkle_proof": "...",
    "anchor_txid": "abc123..."
  }
```

#### Layer 3: Direct Nostr Resolution (No Gateway)

Any wallet can resolve names without the gateway:

1. Query Nostr relays for kind `38383` events with `d` tag matching `alice@nosecond.best`
2. Get the owner pubkey from the event
3. Verify the owner pubkey matches the on-chain registration (using the merkle proof from any NSB indexer or the API)
4. Use the resolution data

```
Wallet → Nostr Relay: REQ ["REQ", "sub1", {"kinds": [38383], "#d": ["alice@nosecond.best"]}]
Relay → Wallet: EVENT {...}
Wallet: verify event.pubkey == registered owner for "alice"
Wallet: extract payment info from tags
```

### 3.5 Verification Chain

Full verification that `₿alice@nosecond.best` is legitimate:

```
1. Find on-chain anchor tx with NSB_PROTOCOL_TAG
2. Extract merkle_root from OP_RETURN
3. Verify alice's registration record against merkle_root (using merkle proof)
4. Extract owner_pubkey from registration record
5. Find latest kind:38383 Nostr event for "alice@nosecond.best"
6. Verify event is signed by owner_pubkey
7. Extract payment addresses from event tags
8. ✅ Verified: these addresses belong to the registered owner of "alice"
```

---

## 4. Registration Flow (User Journey)

### 4.1 New Registration

```
User                        NSB Service                   Bitcoin L1
  |                              |                            |
  |-- 1. Check availability ---->|                            |
  |<--- "alice" is available ----|                            |
  |                              |                            |
  |-- 2. Submit registration --->|                            |
  |   (name + owner pubkey)      |                            |
  |                              |                            |
  |<-- 3. Lightning invoice -----|                            |
  |                              |                            |
  |-- 4. Pay invoice ----------->|                            |
  |                              |                            |
  |<-- 5. Confirmation + --------|                            |
  |       merkle proof (pending) |                            |
  |                              |-- 6. Batch anchor tx ----->|
  |                              |    (OP_RETURN merkle root) |
  |                              |                            |
  |<-- 7. Final confirmation ----|                            |
  |       (with txid + proof)    |                            |
  |                              |                            |
  |-- 8. Publish Nostr event --->| (relays)                   |
  |   (resolution data)         |                            |
  |                              |                            |
  ✅ ₿alice@nosecond.best is live                             |
```

### 4.2 Update Resolution Data

```
User                         Nostr Relays              NSB Gateway
  |                              |                         |
  |-- Publish new kind:38383 --->|                         |
  |   (signed by owner key)      |                         |
  |                              |--- event propagation -->|
  |                              |                         |-- update DNS/API
  |                              |                         |
  ✅ Resolution updated (no on-chain tx needed)
```

### 4.3 Transfer Ownership

```
Current Owner                NSB Service                Bitcoin L1
  |                              |                         |
  |-- Request transfer --------->|                         |
  |   (name, new_owner_pubkey,   |                         |
  |    signed by current owner)  |                         |
  |                              |                         |
  |<-- Lightning invoice --------|                         |
  |                              |                         |
  |-- Pay ---------------------->|                         |
  |                              |-- Batch anchor -------->|
  |                              |   (transfer record      |
  |                              |    in merkle tree)       |
  |                              |                         |
  ✅ New owner publishes their Nostr resolution event
```

---

## 5. Phase 2: Any Domain

### How third-party domains join the protocol

A domain owner (e.g., `bitcoin.org`) can offer `₿name@bitcoin.org` by:

1. **Register domain on-chain** — Prove domain ownership via a DNS TXT record + on-chain anchor
   ```
   _nsb-verify.bitcoin.org IN TXT "nsb:verify:<owner_pubkey>"
   ```
   Then anchor this claim on Bitcoin (batched with other operations)

2. **Run an NSB resolver** — Open-source software that:
   - Accepts name registrations for their domain
   - Publishes batch anchors to Bitcoin
   - Serves BIP-353 DNS records
   - Watches Nostr relays for resolution updates

3. **Or delegate to nosecond.best** — We host the resolver for them (SaaS model)

### Federation model
- Each domain is autonomous — they control their own names
- All registrations anchor to the same Bitcoin timechain
- Cross-domain verification works the same way (merkle proofs)
- Nostr events include the full `name@domain` identifier

---

## 6. Phase 3: Domain-Free Names

### `₿alice` (no @ sign)

When the protocol has enough adoption:
- Names registered without a domain resolve against a **global on-chain registry**
- No single entity controls the namespace
- Resolution still via Nostr events, but the `d` tag is just `alice` (no domain)
- First-come-first-served, anchored on Bitcoin

### Challenges
- **Squatting** — mitigated by pricing (auction model for short/premium names)
- **Disputes** — no central authority; code is law
- **Transition** — `₿alice@nosecond.best` → `₿alice` migration path needed

---

## 7. Reserved Names & Pricing

### Phase 1 Pricing (nosecond.best)

| Category | Examples | Price |
|----------|---------|-------|
| Ultra-premium (1-3 chars) | ₿btc, ₿pay, ₿sat | Auction / offers |
| Premium (common words) | ₿alice, ₿wallet, ₿shop | 100,000+ sats |
| Standard (4+ chars) | ₿satoshisan, ₿mystore | 10,000 sats |
| Long (10+ chars) | ₿mylongusername | 1,000 sats |

### Reserved names (controlled by NSB)
Top 1000 common first names, top 500 common words, brand names (released on verified request), Bitcoin-related terms (btc, bitcoin, satoshi, lightning, etc.)

### Renewal
- Names registered for 52,560 blocks (~1 year)
- Renewal at same rate
- Grace period: 4,320 blocks (~30 days) after expiry
- Expired names return to available pool

---

## 8. Revenue Model

| Stream | Description |
|--------|-------------|
| Name registration fees | Primary revenue — Lightning payments for registration |
| Premium name sales | Auction/fixed price for desirable names |
| Renewal fees | Recurring revenue from yearly renewals |
| Domain hosting (Phase 2) | SaaS for third-party domains |
| API access | Free tier + paid for high-volume commercial use |

---

## 9. Security Considerations

### Threat: Name hijacking
- **Mitigation:** Ownership = cryptographic key. Only the key holder can update resolution or transfer.

### Threat: DNS spoofing (gateway)
- **Mitigation:** DNSSEC on nosecond.best. Wallets that verify on-chain anchors don't trust DNS at all.

### Threat: Merkle proof forgery
- **Mitigation:** Proofs are verified against on-chain OP_RETURN data. Forging requires rewriting Bitcoin blocks.

### Threat: Nostr relay censorship
- **Mitigation:** Events are published to multiple relays. Any relay can serve them. Users can self-host.

### Threat: NSB service goes down
- **Mitigation:** On-chain registrations persist forever. Nostr events are on relays. Any indexer can reconstruct the registry. Only the BIP-353 gateway needs the service.

### Threat: Key loss
- **Mitigation:** Standard key backup practices. Future: social recovery via multisig or threshold signatures.

---

## 10. Technical Stack (Proposed)

| Component | Technology |
|-----------|-----------|
| Gateway server | Rust or TypeScript |
| Bitcoin interaction | Bitcoin Core RPC / Electrum |
| Lightning payments | LND / CLN / LDK |
| Nostr integration | nostr-tools / custom relay client |
| DNS serving | PowerDNS or custom authoritative server |
| Database | PostgreSQL (indexer state) |
| Frontend | Web app for registration + management |

---

## 11. Open Questions

1. **Nostr event kind:** 38383 is placeholder — should we request an official NIP for this?
2. **Batch economics:** What's the optimal batch interval vs. user experience tradeoff?
3. **Light client verification:** How do mobile wallets verify merkle proofs without running a full node?
4. **Name disputes:** Is pure first-come-first-served sufficient, or do we need a dispute mechanism?
5. **BIP-353 compatibility:** Should Phase 1 be pure BIP-353 (just DNS) before adding the on-chain layer?
6. **Silent payments integration:** How do BIP-352 silent payment addresses interact with this system?

---

## 12. Roadmap

### Phase 1 — MVP (nosecond.best gateway)
- [ ] Domain setup + DNSSEC
- [ ] BIP-353 compatible DNS resolution
- [ ] Web registration interface
- [ ] Lightning payment integration
- [ ] On-chain batch anchoring
- [ ] Nostr event publishing
- [ ] Reserved name list
- [ ] API v1

### Phase 2 — Federation
- [ ] Open-source resolver software
- [ ] Domain verification protocol
- [ ] Third-party domain onboarding
- [ ] Cross-domain resolution

### Phase 3 — Sovereignty
- [ ] Domain-free name protocol
- [ ] Decentralized indexer network
- [ ] Wallet integration SDK
- [ ] NIP proposal for Nostr name events

---

*This is a living document. Version 0.1 — expect significant changes as the protocol is refined.*
