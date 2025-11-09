import { NS } from '@ns';
import { SortedArray } from '/lib/sortedArray';

type TestItem = {
    id: string;
    value: number;
};

function generateRandomItems(length: number): TestItem[] {
    return Array.from({ length }, (_, i) => ({
        id: `item${i}`,
        value: Math.random() * 1000,
    }));
}

function verifySortedOrder(items: TestItem[]): boolean {
    for (let i = 1; i < items.length; i++) {
        if (items[i].value < items[i - 1].value) {
            throw new Error(
                `Sort order violation at index ${i}: ${items[i - 1].value} > ${items[i].value}`,
            );
        }
    }
    return true;
}

function verifyKeyMapping(
    array: SortedArray<string, TestItem>,
    items: TestItem[],
): boolean {
    for (const item of items) {
        const stored = array.getByKey(item.id);
        if (!stored || stored.id !== item.id || stored.value !== item.value) {
            throw new Error(`Key mapping error for id ${item.id}`);
        }
    }
    return true;
}

export async function main(ns: NS): Promise<void> {
    // Test basic operations first
    ns.tprint('Testing basic operations...');
    const basic = new SortedArray<string, TestItem>(
        (item) => item.id,
        (item) => item.value,
    );

    // Test insert and order
    basic.insert({ id: 'a', value: 3 });
    basic.insert({ id: 'b', value: 1 });
    basic.insert({ id: 'c', value: 2 });

    const basicArray = basic.toArray();
    if (basicArray[0].value !== 1 || basicArray[2].value !== 3) {
        throw new Error('Basic sort order incorrect');
    }

    // Test findNext
    const next = basic.findNext(1.5);
    if (!next || next.value !== 2) {
        throw new Error('findNext failed');
    }

    // Test removeByKey
    const removed = basic.removeByKey('b');
    if (!removed || removed.value !== 1 || basic.size !== 2) {
        throw new Error('removeByKey failed');
    }

    ns.tprint('Basic operations passed!');

    // Performance testing
    const testLengths = [1000, 2000, 5000, 10000];
    const testsPerLength = 5;

    for (const length of testLengths) {
        let totalInsertTime = 0;
        let totalLookupTime = 0;
        let totalUpdateTime = 0;

        ns.tprint(`Testing arrays of length ${length}`);

        for (let test = 0; test < testsPerLength; test++) {
            const items = generateRandomItems(length);
            const array = new SortedArray<string, TestItem>(
                (item) => item.id,
                (item) => item.value,
            );

            // Test insertion
            const insertStart = performance.now();
            items.forEach((item) => array.insert(item));
            const insertEnd = performance.now();
            totalInsertTime += insertEnd - insertStart;

            // Verify order and key mapping
            verifySortedOrder(array.toArray());
            verifyKeyMapping(array, items);

            // Test lookups
            const lookupStart = performance.now();
            for (let i = 0; i < length; i++) {
                array.getByKey(`item${i}`);
                array.findNext(items[i].value);
            }
            const lookupEnd = performance.now();
            totalLookupTime += lookupEnd - lookupStart;

            // Test updates
            const updateStart = performance.now();
            for (let i = 0; i < length; i++) {
                const item = array.getByKey(`item${i}`)!;
                item.value += Math.random() * 10 - 5; // shift by [-5, 5]
                array.update(`item${i}`);
            }
            const updateEnd = performance.now();
            totalUpdateTime += updateEnd - updateStart;

            // Verify order maintained after updates
            verifySortedOrder(array.toArray());
        }

        const avgInsertTime = totalInsertTime / testsPerLength;
        const avgLookupTime = totalLookupTime / testsPerLength;
        const avgUpdateTime = totalUpdateTime / testsPerLength;

        ns.tprint(`Length ${length}:`);
        ns.tprint(`  Avg Insert Time: ${avgInsertTime.toFixed(2)}ms`);
        ns.tprint(`  Avg Lookup Time: ${avgLookupTime.toFixed(2)}ms`);
        ns.tprint(`  Avg Update Time: ${avgUpdateTime.toFixed(2)}ms`);
        ns.tprint(
            `  Avg Total Time: ${(avgInsertTime + avgLookupTime + avgUpdateTime).toFixed(2)}ms`,
        );
        ns.tprint('----------------------------------------');
    }
}
