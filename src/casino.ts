import { NS } from '@ns';

// ============================================================================
// CONFIGURATION
// ============================================================================
const MIN_BET = 1e3;
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
async function placeBet(guess: number, amount: number): Promise<number> {
    // TODO: Replace with actual Bitburner casino call
    // Must return the OBSERVED result (0–36)
    return 0;
}

// ============================================================================
// EXPLOITATION PHASE – WE HAVE EXACT SEED, NOW FARM MONEY
// ============================================================================
export async function exploitWithSeed(seed: SeedCandidate): Promise<void> {
    while (true) {
        // 1. Predict the next outcome
        let predicted = seed.next;

        // 2. Bet maximum
        const observed = await placeBet(predicted, MAX_BET);

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
    ns.tprint('Starting discovery...');

    let candidates = Array.from(
        { length: 30000 },
        (_, i) => new SeedCandidate(i),
    );

    while (candidates.length > 1) {
        ns.tprint(`Remaining candidates: ${candidates.length}`);

        // Place a dummy bet that forces loss
        const observed = await placeBet(1, MIN_BET);

        candidates = candidates.filter((c) => c.attemptEliminate(1, observed));
    }

    const seed = candidates[0];

    ns.tprint('Seed discovered. Exploiting...');

    await exploitWithSeed(seed);
}
