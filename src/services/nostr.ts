/**
 * Nostr event publishing for name registrations
 */
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { Relay } from 'nostr-tools/relay';
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js';
import { config } from '../config.js';
import type { NameRecord, ResolutionRecord } from '../db/names.js';

let serverSecretKey: Uint8Array | null = null;

function getServerKey(): Uint8Array | null {
  if (serverSecretKey) return serverSecretKey;
  const nsec = process.env.NSB_NOSTR_NSEC;
  if (!nsec) {
    console.warn('[nostr] NSB_NOSTR_NSEC not set — skipping Nostr publishing');
    return null;
  }
  // Expect hex-encoded 32-byte secret key
  serverSecretKey = hexToBytes(nsec);
  return serverSecretKey;
}

/**
 * Build a kind 38383 parameterized replaceable event for a name registration
 */
export function buildNameEvent(
  record: NameRecord,
  resolution?: ResolutionRecord | null,
): { kind: number; tags: string[][]; content: string; created_at: number } {
  const dTag = `${record.name}@${record.domain}`;
  const tags: string[][] = [
    ['d', dTag],
  ];

  if (resolution?.onchain_address) tags.push(['onchain', resolution.onchain_address]);
  if (resolution?.lightning) tags.push(['lightning', resolution.lightning]);
  if (resolution?.lnurl) tags.push(['lnurl', resolution.lnurl]);
  if (resolution?.bolt12) tags.push(['bolt12', resolution.bolt12]);
  if (resolution?.silent_payment) tags.push(['silent', resolution.silent_payment]);
  if (resolution?.nostr_pubkey) tags.push(['nostr', resolution.nostr_pubkey]);

  return {
    kind: config.nostrEventKind,
    tags,
    content: JSON.stringify({
      name: record.name,
      domain: record.domain,
      owner: record.owner_pubkey,
    }),
    created_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * Sign and publish a name event to configured relays
 */
export async function publishNameEvent(
  record: NameRecord,
  resolution?: ResolutionRecord | null,
): Promise<string | null> {
  const sk = getServerKey();
  if (!sk) return null;

  const eventTemplate = buildNameEvent(record, resolution);
  const signedEvent = finalizeEvent(eventTemplate, sk);

  console.log(`[nostr] Publishing event ${signedEvent.id} for ${record.name}@${record.domain}`);

  // Publish to all relays (best-effort)
  const results = await Promise.allSettled(
    config.nostrRelays.map(async (url) => {
      try {
        const relay = await Relay.connect(url);
        await relay.publish(signedEvent);
        relay.close();
        console.log(`[nostr] Published to ${url}`);
      } catch (err) {
        console.warn(`[nostr] Failed to publish to ${url}:`, err);
      }
    })
  );

  return signedEvent.id;
}
