---
title: Hash Tables
tags: [cs]
---

# Hash Tables

A hash table maps keys to values using a hash function that computes an index into an array of buckets. Average O(1) time for insert, delete, and lookup.

## Collision Resolution

- **Chaining** — each bucket holds a linked list
- **Open addressing** — linear probing, quadratic probing, double hashing

Load factor (n/m) determines when to resize. A well-implemented hash table provides near-constant time performance.
