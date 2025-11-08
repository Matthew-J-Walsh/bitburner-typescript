class LinkedListNode<T> {
    constructor(
        public value: T,
        public next: LinkedListNode<T> | null = null,
    ) {}
}

export class LinkedList<T> implements Iterable<T> {
    private head: LinkedListNode<T> | null = null;
    private tail: LinkedListNode<T> | null = null;
    private _length = 0;

    get length(): number {
        return this._length;
    }

    get isEmpty(): boolean {
        return this._length === 0;
    }

    /** Add value to the end (O(1)) */
    push(value: T): void {
        const node = new LinkedListNode(value);
        if (!this.head) {
            this.head = this.tail = node;
        } else {
            this.tail!.next = node;
            this.tail = node;
        }
        this._length++;
    }

    /** Remove and return the first value (O(1)) */
    pop(): T | undefined {
        if (!this.head) return undefined;
        const value = this.head.value;
        this.head = this.head.next;
        if (!this.head) this.tail = null;
        this._length--;
        return value;
    }

    /** Return the first value without removing it (O(1)) */
    peek(): T | undefined {
        return this.head?.value;
    }

    /** Clear the list */
    clear(): void {
        this.head = this.tail = null;
        this._length = 0;
    }

    /** Convert to array (O(n)) */
    toArray(): T[] {
        const arr: T[] = [];
        let node = this.head;
        while (node) {
            arr.push(node.value);
            node = node.next;
        }
        return arr;
    }

    /** Support for `for..of` loops */
    *[Symbol.iterator](): IterableIterator<T> {
        let node = this.head;
        while (node) {
            yield node.value;
            node = node.next;
        }
    }
}
