import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

/**
 * Compute SHA256 hash of concatenated inputs
 */
function hashPair(a: Uint8Array, b: Uint8Array): Uint8Array {
  const combined = new Uint8Array(a.length + b.length);
  // Sort to ensure deterministic ordering
  if (bytesToHex(a) < bytesToHex(b)) {
    combined.set(a);
    combined.set(b, a.length);
  } else {
    combined.set(b);
    combined.set(a, b.length);
  }
  return sha256(combined);
}

/**
 * Hash a leaf value (double-hash to prevent second preimage attacks)
 */
export function hashLeaf(data: string): string {
  return bytesToHex(sha256(sha256(new TextEncoder().encode(data))));
}

/**
 * Build a merkle tree from leaf hashes and return the root + proofs
 */
export function buildMerkleTree(leafHashes: string[]): {
  root: string;
  proofs: Map<string, string[]>;
} {
  if (leafHashes.length === 0) {
    return { root: '0'.repeat(64), proofs: new Map() };
  }

  if (leafHashes.length === 1) {
    return {
      root: leafHashes[0],
      proofs: new Map([[leafHashes[0], []]]),
    };
  }

  // Track proof paths for each leaf
  const proofs = new Map<string, string[]>();
  for (const leaf of leafHashes) {
    proofs.set(leaf, []);
  }

  let level = leafHashes.map(h => ({ hash: h, originalLeaves: [h] }));

  while (level.length > 1) {
    const nextLevel: typeof level = [];

    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        const left = level[i];
        const right = level[i + 1];
        const parentHash = bytesToHex(
          hashPair(hexToBytes(left.hash), hexToBytes(right.hash))
        );

        // Add sibling to each leaf's proof
        for (const leaf of left.originalLeaves) {
          proofs.get(leaf)!.push(right.hash);
        }
        for (const leaf of right.originalLeaves) {
          proofs.get(leaf)!.push(left.hash);
        }

        nextLevel.push({
          hash: parentHash,
          originalLeaves: [...left.originalLeaves, ...right.originalLeaves],
        });
      } else {
        // Odd node — promote it
        nextLevel.push(level[i]);
      }
    }

    level = nextLevel;
  }

  return { root: level[0].hash, proofs };
}

/**
 * Verify a merkle proof
 */
export function verifyMerkleProof(
  leafHash: string,
  proof: string[],
  root: string,
): boolean {
  let current = hexToBytes(leafHash);

  for (const siblingHex of proof) {
    current = hashPair(current, hexToBytes(siblingHex));
  }

  return bytesToHex(current) === root;
}
