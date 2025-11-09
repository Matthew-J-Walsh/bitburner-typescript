//Untested
export class IndexedHeap<K, T> {
    private heap: T[] = [];
    private indexMap: Map<T, number> = new Map();
    private keyMap: Map<K, T> = new Map();

    constructor(
        private compare: (a: T, b: T) => number,
        private getKey: (item: T) => K,
    ) {}

    public push(value: T): void {
        const key = this.getKey(value);
        // Remove old value if it exists
        const existing = this.keyMap.get(key);
        if (existing) {
            const index = this.indexMap.get(existing);
            if (index !== undefined) {
                this.remove(index);
            }
        }

        this.heap.push(value);
        this.indexMap.set(value, this.heap.length - 1);
        this.keyMap.set(key, value);
        this.siftUp(this.heap.length - 1);
    }

    public peek(): T | undefined {
        return this.heap[0];
    }

    public pop(): T | undefined {
        if (this.heap.length === 0) return undefined;

        const result = this.heap[0];
        const last = this.heap.pop()!;

        this.indexMap.delete(result);
        this.keyMap.delete(this.getKey(result));

        if (this.heap.length > 0) {
            this.heap[0] = last;
            this.indexMap.set(last, 0);
            this.siftDown(0);
        }

        return result;
    }

    public updateByKey(key: K, updater: (item: T) => T): void {
        const existing = this.keyMap.get(key);
        if (!existing) return;

        const index = this.indexMap.get(existing);
        if (index === undefined) return;

        const updated = updater(existing);
        this.heap[index] = updated;
        this.indexMap.delete(existing);
        this.indexMap.set(updated, index);
        this.keyMap.set(key, updated);

        const parentIdx = Math.floor((index - 1) / 2);
        if (parentIdx >= 0 && this.compare(this.heap[parentIdx], updated) > 0) {
            this.siftUp(index);
        } else {
            this.siftDown(index);
        }
    }

    public getByKey(key: K): T | undefined {
        return this.keyMap.get(key);
    }

    public size(): number {
        return this.heap.length;
    }

    private remove(index: number): void {
        const value = this.heap[index];
        const last = this.heap.pop()!;

        if (index < this.heap.length) {
            this.heap[index] = last;
            this.indexMap.set(last, index);

            const parentIdx = Math.floor((index - 1) / 2);
            if (
                parentIdx >= 0 &&
                this.compare(this.heap[parentIdx], last) > 0
            ) {
                this.siftUp(index);
            } else {
                this.siftDown(index);
            }
        }

        this.indexMap.delete(value);
        this.keyMap.delete(this.getKey(value));
    }

    private siftUp(index: number): void {
        while (index > 0) {
            const parentIndex = (index - 1) >> 1;
            if (this.compare(this.heap[parentIndex], this.heap[index]) <= 0)
                break;
            [this.heap[index], this.heap[parentIndex]] = [
                this.heap[parentIndex],
                this.heap[index],
            ];
            index = parentIndex;
        }
    }

    private siftDown(index: number): void {
        const length = this.heap.length;
        while (true) {
            let smallest = index;
            const leftChild = (index << 1) + 1;
            const rightChild = leftChild + 1;

            if (
                leftChild < length &&
                this.compare(this.heap[leftChild], this.heap[smallest]) < 0
            ) {
                smallest = leftChild;
            }
            if (
                rightChild < length &&
                this.compare(this.heap[rightChild], this.heap[smallest]) < 0
            ) {
                smallest = rightChild;
            }
            if (smallest === index) break;

            [this.heap[index], this.heap[smallest]] = [
                this.heap[smallest],
                this.heap[index],
            ];
            index = smallest;
        }
    }
}
