import { describe, it, expect } from 'vitest';
import { hashLeaf, buildMerkleTree, verifyMerkleProof } from '../utils/merkle.js';

describe('Merkle Tree', () => {
  it('should hash leaves deterministically', () => {
    const h1 = hashLeaf('alice');
    const h2 = hashLeaf('alice');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it('should build tree with single leaf', () => {
    const leaf = hashLeaf('alice');
    const { root, proofs } = buildMerkleTree([leaf]);
    expect(root).toBe(leaf);
    expect(proofs.get(leaf)).toEqual([]);
  });

  it('should build tree with two leaves', () => {
    const leaves = ['alice', 'bob'].map(hashLeaf);
    const { root, proofs } = buildMerkleTree(leaves);

    expect(root).not.toBe(leaves[0]);
    expect(root).not.toBe(leaves[1]);

    // Both should have proofs
    expect(proofs.get(leaves[0])).toHaveLength(1);
    expect(proofs.get(leaves[1])).toHaveLength(1);

    // Proofs should verify
    expect(verifyMerkleProof(leaves[0], proofs.get(leaves[0])!, root)).toBe(true);
    expect(verifyMerkleProof(leaves[1], proofs.get(leaves[1])!, root)).toBe(true);
  });

  it('should build tree with many leaves and all proofs verify', () => {
    const names = ['alice', 'bob', 'charlie', 'dave', 'eve', 'frank', 'grace'];
    const leaves = names.map(hashLeaf);
    const { root, proofs } = buildMerkleTree(leaves);

    for (const leaf of leaves) {
      const proof = proofs.get(leaf)!;
      expect(verifyMerkleProof(leaf, proof, root)).toBe(true);
    }
  });

  it('should fail verification with wrong root', () => {
    const leaves = ['alice', 'bob'].map(hashLeaf);
    const { proofs } = buildMerkleTree(leaves);

    const fakeRoot = hashLeaf('fake');
    expect(verifyMerkleProof(leaves[0], proofs.get(leaves[0])!, fakeRoot)).toBe(false);
  });

  it('should fail verification with wrong proof', () => {
    const leaves = ['alice', 'bob', 'charlie'].map(hashLeaf);
    const { root, proofs } = buildMerkleTree(leaves);

    // Use alice's proof for bob
    expect(verifyMerkleProof(leaves[1], proofs.get(leaves[0])!, root)).toBe(false);
  });
});
