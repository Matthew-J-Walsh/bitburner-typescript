import { NS } from '@ns';
import React from 'react';

// ============================================================================
// CONFIGURATION
// ============================================================================
const MIN_BET = 1;
const MAX_BET = 1e7; // up to casino cap

// ============================================================================
// RNG IMPLEMENTATION (WHRNG) — identical to Bitburner implementation
// ============================================================================
export class SeedCandidate {
    private s1 = 0;
    private s2 = 0;
    private s3 = 0;

    constructor(initialState: number) {
        this.s1 = initialState;
        this.s2 = initialState;
        this.s3 = initialState;
    }

    private step(): void {
        this.s1 = (171 * this.s1) % 30269;
        this.s2 = (172 * this.s2) % 30307;
        this.s3 = (170 * this.s3) % 30323;
    }

    private random(): number {
        this.step();
        return (
            (this.s1 / 30269.0 + this.s2 / 30307.0 + this.s3 / 30323.0) % 1.0
        );
    }

    // Returns roulette outcome 0–36
    get next(): number {
        return Math.floor(this.random() * 37);
    }

    // Check if this seed is still viable
    // bet = our predicted outcome
    // observed = what the casino actually gave
    public attemptEliminate(bet: number, observed: number): boolean {
        while (true) {
            const value = this.next;

            if (value === observed) {
                // Could match exactly: valid seed
                return true;
            }

            if (value === bet) {
                // Forced-loss path: step again and check
                continue;
            }

            // Neither the observed value nor the bet: impossible seed
            return false;
        }
    }
}

// ============================================================================
// BETTING FUNCTION – YOU MUST IMPLEMENT THIS
// ============================================================================
async function placeBet(
    ns: NS,
    doc: Document,
    guess: number,
    amount: number,
): Promise<number> {
    await setText(
        ns,
        getByXpath(ns, doc, "//input[@type='number']"),
        `${amount}`,
    );

    await click(ns, getByXpath(ns, doc, `//table//button[text()='${guess}']`));

    await ns.sleep(1100);

    let value: string = (
        (await getByXpath(
            ns,
            doc,
            "(//button[contains(.,'Stop playing')]/following-sibling::h4)[1]",
        )) as any
    ).text();

    // Must return the OBSERVED result (0–36)
    return parseInt(value.slice(0, -1));
}

async function click(ns: NS, button: any) {
    if (!button) throw new Error('Only send click confirmed to exist buttons');

    await ns.sleep(10);

    let fnOnClick = button[Object.keys(button)[1]].onClick; // Figure out what I do lamo

    if (!fnOnClick)
        throw new Error(`${button.text()} missing an onClick method`);

    await fnOnClick({ isTrusted: true }); // We can make it trusted by willing it so!

    await ns.sleep(10);
}

async function setText(ns: NS, input: any, text: string) {
    if (!input)
        throw new Error('Only send setText confirmed to exist textboxes');

    await ns.sleep(10);

    let fnOnChange = input[Object.keys(input)[1]].onChange;

    if (!fnOnChange)
        throw new Error(`${input.text()} missing an onChange method`);

    await fnOnChange({ isTrusted: true, target: { value: text } }); // We can make it trusted by willing it so!

    await ns.sleep(10);
}

async function getByXpath(ns: NS, doc: Document, xpath: string) {
    for (let i = 0; i < 10; i++) {
        try {
            return doc.evaluate(
                xpath,
                doc,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null,
            ).singleNodeValue;
        } catch (e) {
            await ns.sleep(5);
        }
    }
    throw new Error(`${xpath} missing from ${doc}`);
}

// ============================================================================
// EXPLOITATION PHASE – WE HAVE EXACT SEED, NOW FARM MONEY
// ============================================================================
export async function exploitWithSeed(
    ns: NS,
    doc: Document,
    seed: SeedCandidate,
): Promise<void> {
    while (true) {
        // 1. Predict the next outcome
        let predicted = seed.next;

        // 2. Bet maximum
        const observed = await placeBet(ns, doc, predicted, MAX_BET);

        if (observed === predicted) {
            // WIN: Seed has already advanced correctly in-place
            continue;
        }

        // 3. Loss: forced-advance known seed until it reaches observed
        // If it NEVER reaches observed — logic error
        let chained = predicted;
        while (predicted === chained) {
            chained = seed.next;
        }

        if (chained !== observed) {
            throw new Error(
                'Seed desync: predicted path never reached observed value.',
            );
        }
    }
}

// ============================================================================
// MAIN Function
// ============================================================================
export async function main(ns: NS) {
    let doc: Document = eval('document');

    if (ns.getPlayer().city !== 'Aevum') throw new Error('Get into Aevum rat');

    //ns.singularity.goToLocation("Iker Molina Casino")
    await click(
        ns,
        getByXpath(
            ns,
            doc,
            "//div[(@role = 'button') and (contains(., 'City'))]",
        ),
    );

    await click(
        ns,
        getByXpath(ns, doc, "//span[@aria-label = 'Iker Molina Casino']"),
    );

    await click(
        ns,
        getByXpath(ns, doc, "//button[contains(text(), 'roulette')]"),
    );

    ns.tprint('Starting discovery...');

    let candidates = Array.from(
        { length: 30000 },
        (_, i) => new SeedCandidate(i),
    );

    while (candidates.length > 1) {
        ns.tprint(`Remaining candidates: ${candidates.length}`);

        // Place a dummy bet that forces loss
        const observed = await placeBet(ns, doc, 0, MIN_BET);

        candidates = candidates.filter((c) => c.attemptEliminate(1, observed));
    }

    const seed = candidates[0];

    ns.tprint('Seed discovered. Exploiting...');

    await exploitWithSeed(ns, doc, seed);
}
