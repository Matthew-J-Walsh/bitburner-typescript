export class KeyedMinHeap<K, T> {
    private heap: T[] = [];
    private indexMap = new Map<K, number>();

    constructor(
        private getKey: (item: T) => K,
        private getValue: (item: T) => number,
    ) {}

    // --- Internal Helpers ---
    private parent(i: number) {
        return Math.floor((i - 1) / 2);
    }
    private left(i: number) {
        return 2 * i + 1;
    }
    private right(i: number) {
        return 2 * i + 2;
    }

    private swap(i: number, j: number) {
        const tmp = this.heap[i];
        this.heap[i] = this.heap[j];
        this.heap[j] = tmp;
        this.indexMap.set(this.getKey(this.heap[i]), i);
        this.indexMap.set(this.getKey(this.heap[j]), j);
    }

    private heapifyUp(i: number) {
        while (i > 0) {
            const p = this.parent(i);
            if (this.getValue(this.heap[p]) <= this.getValue(this.heap[i]))
                break;
            this.swap(i, p);
            i = p;
        }
    }

    private heapifyDown(i: number) {
        const n = this.heap.length;
        while (true) {
            const l = this.left(i);
            const r = this.right(i);
            let smallest = i;

            if (
                l < n &&
                this.getValue(this.heap[l]) < this.getValue(this.heap[smallest])
            )
                smallest = l;
            if (
                r < n &&
                this.getValue(this.heap[r]) < this.getValue(this.heap[smallest])
            )
                smallest = r;

            if (smallest === i) break;
            this.swap(i, smallest);
            i = smallest;
        }
    }

    // --- Public API ---
    insert(item: T) {
        const key = this.getKey(item);
        if (this.indexMap.has(key)) {
            throw new Error(`Duplicate key: ${String(key)}`);
        }
        this.heap.push(item);
        const idx = this.heap.length - 1;
        this.indexMap.set(key, idx);
        this.heapifyUp(idx);
    }

    peek(): T | undefined {
        return this.heap[0];
    }

    pop(): T | undefined {
        if (this.heap.length === 0) return undefined;
        const min = this.heap[0];
        const last = this.heap.pop()!;
        const minKey = this.getKey(min);
        this.indexMap.delete(minKey);

        if (this.heap.length > 0) {
            this.heap[0] = last;
            this.indexMap.set(this.getKey(last), 0);
            this.heapifyDown(0);
        }

        return min;
    }

    removeByKey(key: K): T | undefined {
        const idx = this.indexMap.get(key);
        if (idx === undefined) return undefined;

        const removed = this.heap[idx];
        const last = this.heap.pop()!;
        this.indexMap.delete(key);

        if (idx < this.heap.length) {
            this.heap[idx] = last;
            this.indexMap.set(this.getKey(last), idx);
            this.heapifyUp(idx);
            this.heapifyDown(idx);
        }

        return removed;
    }

    get size(): number {
        return this.heap.length;
    }
    isEmpty() {
        return this.heap.length === 0;
    }

    toArray(): T[] {
        return [...this.heap];
    }
}
