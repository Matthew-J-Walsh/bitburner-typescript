import { NS } from '@ns';
import { KeyedMinHeap } from '/lib/keyedHeap';

type TestItem = {
    id: string;
    value: number;
};

function generateRandomTestItems(length: number): TestItem[] {
    return Array.from({ length }, (_, i) => ({
        id: `item${i}`,
        value: Math.random() * 1000,
    }));
}

function verifyHeapOrder(items: TestItem[]): boolean {
    for (let i = 1; i < items.length; i++) {
        if (items[i].value < items[i - 1].value) {
            throw new Error(
                `Heap order violation at index ${i}: ${items[i - 1].value} > ${items[i].value}`,
            );
        }
    }
    return true;
}

function runBasicTests(ns: NS, heap: KeyedMinHeap<string, TestItem>): void {
    // Test isEmpty on empty heap
    if (!heap.isEmpty()) throw new Error('New heap should be empty');
    if (heap.size !== 0) throw new Error('New heap should have size 0');
    if (heap.peek() !== undefined)
        throw new Error('Peek on empty heap should return undefined');
    if (heap.pop() !== undefined)
        throw new Error('Pop on empty heap should return undefined');

    // Test single item operations
    const item = { id: 'test1', value: 42 };
    heap.insert(item);
    if (heap.isEmpty())
        throw new Error('Heap should not be empty after insert');
    // @ts-ignore
    if (heap.size !== 1)
        throw new Error('Heap should have size 1 after insert');
    if (heap.peek() !== item)
        throw new Error('Peek should return inserted item');

    // Test removeByKey
    const removed = heap.removeByKey('test1');
    if (removed !== item)
        throw new Error('removeByKey should return removed item');
    if (!heap.isEmpty()) throw new Error('Heap should be empty after remove');

    ns.tprint('Basic tests passed');
}

function runDuplicateKeyTest(heap: KeyedMinHeap<string, TestItem>): void {
    heap.insert({ id: 'dup', value: 1 });
    try {
        heap.insert({ id: 'dup', value: 2 });
        throw new Error('Should throw on duplicate key');
    } catch (e: unknown) {
        if (e instanceof Error) {
            if (!e.message.includes('Duplicate key')) {
                throw e; // Rethrow if it's not the expected error
            }
        } else {
            throw e; // Rethrow if not an Error object
        }
    }
}

function runBulkOperationsTest(ns: NS, length: number): number {
    const items = generateRandomTestItems(length);
    const heap = new KeyedMinHeap<string, TestItem>(
        (item) => item.id,
        (item) => item.value,
    );

    // Time bulk insert
    const insertStart = performance.now();
    items.forEach((item) => heap.insert(item));
    const insertEnd = performance.now();

    // Verify size
    if (heap.size !== length) {
        throw new Error(
            `Heap size ${heap.size} doesn't match input length ${length}`,
        );
    }

    // Time and verify removal of half the items by key
    const removalStart = performance.now();
    for (let i = 0; i < length / 2; i++) {
        const removed = heap.removeByKey(items[i].id);
        if (!removed || removed.id !== items[i].id) {
            throw new Error(`Failed to remove item ${items[i].id}`);
        }
    }
    const removalEnd = performance.now();

    // Verify remaining size
    if (heap.size !== Math.floor(length / 2)) {
        throw new Error('Incorrect size after removals');
    }

    // Time and verify ordering during pop
    const sorted: TestItem[] = [];
    const popStart = performance.now();
    while (!heap.isEmpty()) {
        const item = heap.pop();
        if (!item) throw new Error('Unexpected undefined from pop');
        sorted.push(item);
    }
    const popEnd = performance.now();

    // Verify final order
    verifyHeapOrder(sorted);

    const totalTime =
        insertEnd -
        insertStart +
        (removalEnd - removalStart) +
        (popEnd - popStart);

    return totalTime;
}

export async function main(ns: NS): Promise<void> {
    // Initialize test heap
    const heap = new KeyedMinHeap<string, TestItem>(
        (item) => item.id,
        (item) => item.value,
    );

    // Run basic functionality tests
    ns.tprint('Running basic functionality tests...');
    runBasicTests(ns, heap);

    // Run duplicate key test
    ns.tprint('Running duplicate key test...');
    runDuplicateKeyTest(heap);
    ns.tprint('Duplicate key test passed');

    // Run performance tests
    const testLengths = [1000, 2000, 5000, 10000];
    const testsPerLength = 5;

    for (const length of testLengths) {
        let totalTime = 0;

        ns.tprint(`Testing arrays of length ${length}`);

        for (let test = 0; test < testsPerLength; test++) {
            try {
                totalTime += runBulkOperationsTest(ns, length);
            } catch (e: unknown) {
                if (e instanceof Error) {
                    ns.tprint(
                        `ERROR in test ${test} for length ${length}: ${e.message}`,
                    );
                } else {
                    ns.tprint(
                        `ERROR in test ${test} for length ${length}: Unknown error type`,
                    );
                }
                throw e;
            }
        }

        const avgTime = totalTime / testsPerLength;

        ns.tprint(`Length ${length}:`);
        ns.tprint(`  Avg Total Time: ${avgTime.toFixed(2)}ms`);
        ns.tprint('----------------------------------------');
    }

    ns.tprint('All tests completed successfully!');
}
