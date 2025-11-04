//Blame Claude for this code. I just copied it from him.
export class Heap<T> {
    private heap: T[] = [];
    constructor(private compare: (a: T, b: T) => number) {}

    push(value: T): void {
        this.heap.push(value);
        this.siftUp(this.heap.length - 1);
    }

    pop(): T | undefined {
        if (this.heap.length <= 1) return this.heap.pop();
        const result = this.heap[0];
        this.heap[0] = this.heap.pop()!;
        this.siftDown(0);
        return result;
    }

    peek(): T | undefined {
        return this.heap[0];
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

    size(): number {
        return this.heap.length;
    }
}
