import { NS } from '@ns';
import { Heap } from '/lib/heap';

function generateRandomArray(length: number): number[] {
    return Array.from({ length }, () => Math.random() * 1000);
}

function verifyHeapOrder(numbers: number[]): boolean {
    for (let i = 1; i < numbers.length; i++) {
        if (numbers[i] < numbers[i - 1]) {
            throw new Error(
                `Heap order violation at index ${i}: ${numbers[i - 1]} > ${numbers[i]}`,
            );
        }
    }
    return true;
}

export async function main(ns: NS): Promise<void> {
    const testLengths = [
        1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000,
    ];
    const testsPerLength = 10;

    for (const length of testLengths) {
        let totalPushTime = 0;
        let totalPopTime = 0;

        ns.tprint(`Testing arrays of length ${length}`);

        for (let test = 0; test < testsPerLength; test++) {
            const numbers = generateRandomArray(length);
            const heap = new Heap<number>((a, b) => a - b);

            // Test pushing
            const pushStart = performance.now();
            numbers.forEach((n) => heap.push(n));
            const pushEnd = performance.now();
            totalPushTime += pushEnd - pushStart;

            // Test popping
            const sorted: number[] = [];
            const popStart = performance.now();
            while (heap.peek() !== undefined) {
                sorted.push(heap.pop()!);
            }
            const popEnd = performance.now();
            totalPopTime += popEnd - popStart;

            // Verify order
            verifyHeapOrder(sorted);
        }

        const avgPushTime = totalPushTime / testsPerLength;
        const avgPopTime = totalPopTime / testsPerLength;

        ns.tprint(`Length ${length}:`);
        ns.tprint(`  Avg Push Time: ${avgPushTime.toFixed(2)}ms`);
        ns.tprint(`  Avg Pop Time: ${avgPopTime.toFixed(2)}ms`);
        ns.tprint(
            `  Avg Total Time: ${(avgPushTime + avgPopTime).toFixed(2)}ms`,
        );
        ns.tprint('----------------------------------------');
    }
}
