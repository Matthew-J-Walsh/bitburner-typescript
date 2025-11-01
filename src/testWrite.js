/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog('ALL');

    const REPORT_COUNT = 100;
    const ENTRIES = 3000;
    const FORMATS = ['json', 'jsonl', 'csv', 'fixed'];

    // Keep track of total writes and cumulative time
    const stats = {};
    for (const f of FORMATS) stats[f] = { totalMs: 0, writes: 0 };

    let lastReport = performance.now();

    for (var i = 0; i < REPORT_COUNT; i++) {
        const data = generateData(ENTRIES);

        for (const format of FORMATS) {
            const start = performance.now();
            const text = serialize(format, data);
            ns.write(`/test/${format}.txt`, text + '\n', 'a');
            const end = performance.now();

            stats[format].totalMs += end - start;
            stats[format].writes++;
        }
    }

    ns.tprint('==== AVERAGE WRITE TIMES (ms) ====');
    for (const f of FORMATS) {
        const s = stats[f];
        const avg = s.totalMs / s.writes;
        ns.tprintf('%-8s %8.2f ms (writes: %d)', f, avg, s.writes);
    }
    ns.tprint('===============================');

    // --------- utilities ---------
    function generateData(entries) {
        const obj = {};
        for (let i = 0; i < entries; i++) {
            obj[randString(10)] = Math.floor(Math.random() * 1000000);
        }
        return obj;
    }

    function serialize(format, data) {
        switch (format) {
            case 'json':
                return JSON.stringify(data);
            case 'jsonl':
                return JSON.stringify(data); // appending one JSON per line
            case 'csv': {
                let lines = '';
                for (const [k, v] of Object.entries(data))
                    lines += `${k},${v}\n`;
                return lines.trimEnd();
            }
            case 'fixed': {
                let lines = '';
                for (const [k, v] of Object.entries(data)) {
                    const key = (k + '          ').slice(0, 10);
                    const val = v.toString().padStart(8, '0');
                    lines += key + val + '\n';
                }
                return lines.trimEnd();
            }
            default:
                return '';
        }
    }

    function randString(len) {
        const chars =
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from(
            { length: len },
            () => chars[Math.floor(Math.random() * chars.length)],
        ).join('');
    }
}
