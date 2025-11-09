import { NS } from '@ns';
import { LinkedList } from '/lib/linkedList';

function generateRandomArray(length: number): number[] {
    return Array.from({ length }, () => Math.random() * 1000);
}

function verifyListContent<T>(list: LinkedList<T>, array: T[]): boolean {
    if (list.length !== array.length) {
        throw new Error(
            `Length mismatch: list(${list.length}) != array(${array.length})`,
        );
    }

    let idx = 0;
    for (const item of list) {
        if (item !== array[idx]) {
            throw new Error(
                `Content mismatch at index ${idx}: list(${item}) != array(${array[idx]})`,
            );
        }
        idx++;
    }
    return true;
}

function runBasicTests(ns: NS, list: LinkedList<number>): void {
    // Test initial state
    if (!list.isEmpty) throw new Error('New list should be empty');
    if (list.length !== 0) throw new Error('New list should have length 0');
    if (list.peek() !== undefined)
        throw new Error('Peek on empty list should return undefined');
    if (list.pop() !== undefined)
        throw new Error('Pop on empty list should return undefined');

    // Test single item operations
    list.push(42);
    if (list.isEmpty) throw new Error('List should not be empty after push');
    // @ts-ignore
    if (list.length !== 1)
        throw new Error('List should have length 1 after push');
    if (list.peek() !== 42) throw new Error('Peek should return pushed value');

    const popped = list.pop();
    if (popped !== 42) throw new Error('Pop should return pushed value');
    if (!list.isEmpty) throw new Error('List should be empty after pop');

    // Test multiple items
    const values = [1, 2, 3, 4, 5];
    values.forEach((v) => list.push(v));
    if (list.length !== values.length)
        throw new Error('List length incorrect after multiple pushes');
    verifyListContent(list, values);

    // Test clear
    list.clear();
    if (!list.isEmpty) throw new Error('List should be empty after clear');
    if (list.length !== 0)
        throw new Error('List should have length 0 after clear');

    ns.tprint('Basic tests passed');
}

function runIteratorTests(ns: NS, list: LinkedList<number>): void {
    const values = [1, 2, 3, 4, 5];
    values.forEach((v) => list.push(v));

    // Test iterator
    let idx = 0;
    for (const value of list) {
        if (value !== values[idx]) {
            throw new Error(`Iterator value mismatch at index ${idx}`);
        }
        idx++;
    }

    // Test toArray
    const array = list.toArray();
    verifyListContent(list, array);

    ns.tprint('Iterator tests passed');
}

function runPerformanceTest(
    ns: NS,
    length: number,
): { pushTime: number; popTime: number; iterTime: number } {
    const numbers = generateRandomArray(length);
    const list = new LinkedList<number>();

    // Test pushing
    const pushStart = performance.now();
    numbers.forEach((n) => list.push(n));
    const pushEnd = performance.now();
    const pushTime = pushEnd - pushStart;

    // Verify length
    if (list.length !== length) {
        throw new Error(
            `Length mismatch after push: ${list.length} != ${length}`,
        );
    }

    // Test iteration
    const iterStart = performance.now();
    let sum = 0;
    for (const value of list) {
        sum += value;
    }
    const iterEnd = performance.now();
    const iterTime = iterEnd - iterStart;

    // Test popping
    const popStart = performance.now();
    while (!list.isEmpty) {
        list.pop();
    }
    const popEnd = performance.now();
    const popTime = popEnd - popStart;

    // Verify empty
    if (!list.isEmpty) {
        throw new Error('List should be empty after popping all elements');
    }

    return { pushTime, popTime, iterTime };
}

export async function main(ns: NS): Promise<void> {
    const list = new LinkedList<number>();

    // Run basic functionality tests
    ns.tprint('Running basic functionality tests...');
    runBasicTests(ns, list);

    // Run iterator tests
    ns.tprint('Running iterator tests...');
    runIteratorTests(ns, list);
    list.clear();

    // Run performance tests
    const testLengths = [1000, 10000, 50000, 100000];
    const testsPerLength = 5;

    for (const length of testLengths) {
        let totalPushTime = 0;
        let totalPopTime = 0;
        let totalIterTime = 0;

        ns.tprint(`Testing lists of length ${length}`);

        for (let test = 0; test < testsPerLength; test++) {
            try {
                const { pushTime, popTime, iterTime } = runPerformanceTest(
                    ns,
                    length,
                );
                totalPushTime += pushTime;
                totalPopTime += popTime;
                totalIterTime += iterTime;
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

        const avgPushTime = totalPushTime / testsPerLength;
        const avgPopTime = totalPopTime / testsPerLength;
        const avgIterTime = totalIterTime / testsPerLength;

        ns.tprint(`Length ${length}:`);
        ns.tprint(`  Avg Push Time: ${avgPushTime.toFixed(2)}ms`);
        ns.tprint(`  Avg Pop Time: ${avgPopTime.toFixed(2)}ms`);
        ns.tprint(`  Avg Iteration Time: ${avgIterTime.toFixed(2)}ms`);
        ns.tprint(
            `  Avg Total Time: ${(avgPushTime + avgPopTime + avgIterTime).toFixed(2)}ms`,
        );
        ns.tprint('----------------------------------------');
    }

    ns.tprint('All tests completed successfully!');
}
