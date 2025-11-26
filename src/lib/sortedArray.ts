export class SortedArray<K, T> {
    /**
     * Internal array storing items sorted by their numeric value (ascending).
     * The smallest-value item lives at index 0.
     */
    private arr: T[] = [];

    /**
     * Map from item key to the item instance for O(1) lookups and updates.
     */
    private keyMap: Map<K, T> = new Map();

    /**
     * Create a new SortedArray.
     * @param getKey Function that extracts a unique key from an item (used for identity and lookups)
     * @param getValue Function that extracts the numeric value used for ordering (smaller -> earlier)
     */
    constructor(
        private getKey: (item: T) => K,
        private getValue: (item: T) => number,
    ) {}

    /**
     * Returns the smallest item (by numeric value) without removing it.
     * @returns The smallest item or undefined when empty.
     */
    peek(): T | undefined {
        return this.arr[0];
    }

    /**
     * Removes and returns the largest item (end of internal array).
     * Note: this keeps `peek()` as the smallest item at index 0. If you prefer
     * to pop the smallest, use `shift()` on the internal array (not provided).
     * @returns The removed item or undefined when empty.
     */
    pop(): T | undefined {
        return this.arr.pop();
    }

    /**
     * Insert a new item into the sorted array.
     * The item must not already exist (checked by `getKey`). Insertion is O(n)
     * due to array splice but benefits from binary-search to find the position.
     * @param item Item to insert
     * @throws Error if an item with the same key already exists
     */
    insert(item: T): void {
        const key = this.getKey(item);
        if (this.keyMap.has(key)) {
            throw new Error(`Duplicate key '${String(key)}' in SortedArray`);
        }
        const v = this.getValue(item);
        const idx = this.lowerBoundValue(v);
        this.arr.splice(idx, 0, item);
        this.keyMap.set(key, item);
    }

    /**
     * Remove an item by its key.
     * The method locates the item's value bucket via binary search then scans
     * the small range for the exact item (by identity or key) before removing it.
     * @param key Key of the item to remove
     * @returns The removed item or undefined if not found
     */
    removeByKey(key: K): T | undefined {
        const item = this.keyMap.get(key);
        if (!item) return undefined;
        // Search the entire array for the item's current stored position to be robust
        // against callers that may have mutated the item's value before removing.
        const idx = this.findIndexInRange(item, 0, this.arr.length);
        if (idx >= 0) this.arr.splice(idx, 1);
        this.keyMap.delete(key);
        return item;
    }

    /**
     * Repositions an existing item after its numeric value (returned by getValue)
     * has changed. This performs a targeted removal from the item's old value
     * bucket and reinserts it at the appropriate new position.
     * @param key Key of the item to update
     */
    update(key: K): void {
        if (!this.keyMap.has(key)) return;
        const item = this.keyMap.get(key)!;
        // Robust removal: search whole array for the existing item (by identity or key).
        // This handles callers that mutate the item's value before calling update().
        const oldIdx = this.findIndexInRange(item, 0, this.arr.length);
        if (oldIdx >= 0) this.arr.splice(oldIdx, 1);
        // Reinsert according to current value
        const newV = this.getValue(item);
        const newIdx = this.lowerBoundValue(newV);
        this.arr.splice(newIdx, 0, item);
    }

    /**
     * Lookup an item by its key (O(1)).
     * @param key Key to look up
     * @returns The item or undefined if missing
     */
    getByKey(key: K): T | undefined {
        return this.keyMap.get(key);
    }

    /**
     * Find the smallest item whose numeric value is greater than or equal to
     * the provided `after` value. Then give the one skip later
     * @param after Numeric value to compare against
     * @param skip How many indicies to skip after that
     * @returns The smallest item with value >= after, or undefined if none
     */
    findNext(after: number, skip = 0): T | undefined {
        const idx = this.lowerBoundValue(after);
        return this.arr[idx + skip];
    }

    /**
     * Number of items currently stored in the sorted array.
     */
    get size(): number {
        return this.arr.length;
    }

    /**
     * Iterate items in ascending order (smallest numeric value first).
     */
    *[Symbol.iterator](): IterableIterator<T> {
        yield* this.arr;
    }

    toArray(): T[] {
        return [...this.arr];
    }

    // --- internal helpers ---
    /**
     * Numeric comparison helper for values extracted by `getValue`.
     * @param a numeric value
     * @param b numeric value
     * @returns negative when a<b, positive when a>b, zero when equal
     */
    private cmpV(a: number, b: number): number {
        return a - b;
    }

    /**
     * Find the first index where items' value is >= `value`.
     * Equivalent to C++ lower_bound.
     * @param value Numeric value to search for
     * @returns Insertion index
     */
    private lowerBoundValue(value: number): number {
        let lo = 0,
            hi = this.arr.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (this.cmpV(this.getValue(this.arr[mid]), value) < 0)
                lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    /**
     * Find the first index where items' value is > `value`.
     * Equivalent to C++ upper_bound.
     * @param value Numeric value to search for
     * @returns Index of first item with value > provided value
     */
    private upperBoundValue(value: number): number {
        let lo = 0,
            hi = this.arr.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (this.cmpV(this.getValue(this.arr[mid]), value) <= 0)
                lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    /**
     * Find exact index of `item` inside arr restricted to [lo, hi).
     * Uses strict identity first, then falls back to key equality to support
     * situations where the same logical item is represented by a different
     * object instance.
     * @param item Item to locate
     * @param lo Inclusive lower bound index
     * @param hi Exclusive upper bound index
     * @returns Index of item or -1 if not found
     */
    private findIndexInRange(item: T, lo: number, hi: number): number {
        for (let i = lo; i < hi; i++) {
            if (this.arr[i] === item) return i;
            // fallback: check key equality (useful if different object identity but same logical key)
            if (this.getKey(this.arr[i]) === this.getKey(item)) return i;
        }
        return -1;
    }
}
